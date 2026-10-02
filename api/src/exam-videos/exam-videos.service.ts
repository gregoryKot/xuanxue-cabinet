// Чтение видео вопроса/варианта и проверка его готовности (ADR-0133, слой 4.2
// вслед за картинками, exam-images.service.ts). Байты идут в R2, а не в
// MongoDB — сам файл существенно больше картинки (до 50 МБ), Atlas M0 их бы
// не потянул (ADR-0057, тот же довод, что у файлов материалов). Загрузка
// частями — exam-video-uploads.service.ts (ADR-0165); прежняя сырая — ниже, до
// перехода web (exam-video-raw-upload.ts).
//
// Видео, которое ещё грузится частями (`uploading`), ни показать, ни привязать к
// вопросу нельзя: проверка готовности стоит везде, где видео берут по id.
//
// Модель попытки берётся через ExamAttemptModelModule, не через ExamsModule
// целиком — цикл (тот же приём, что ExamImagesService).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  EXAM_VIDEO_UPLOADING_MESSAGE,
  isStaffRole,
  type ExamVideoContentType,
  type ExamVideoDto,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { SingleFlight } from '../common/single-flight';
import { VIEW_VIDEO, signedVideoUrl, type VideoUrlOptions } from '../common/video-link';
import { encryptRecord } from '../utils/encryption';
import { FileStoreService } from '../storage/file-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import { storeRawExamVideo } from './exam-video-raw-upload';
import {
  decryptExamVideo,
  isExamVideoReady,
  readyContentType,
  type RawLeanExamVideo,
} from './exam-video.mapper';
import { EXAM_VIDEO_ENCRYPT_SCHEMA, ExamVideoRecord } from './exam-video.schema';

/** Видео для бота (2026-09-27, «Уточнено» ADR-0133): кэш `telegramFileId`
 * и байты — лениво, `loadBytes()`, не в поле (аудит 2026-10-01, F02): с
 * известным file_id бот шлёт строку, и объект R2 (до 50 МБ) в память не
 * ложится вовсе; без него читается один раз на всех, кто ждёт (SingleFlight). */
export interface LoadedExamVideo {
  loadBytes: () => Promise<Buffer>;
  contentType: ExamVideoContentType;
  telegramFileId?: string;
}

@Injectable()
export class ExamVideosService {
  // Один объект R2 за раз на видео (F02, комментарий у LoadedExamVideo).
  private readonly bytesInFlight = new SingleFlight<Buffer>();

  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly fileStore: FileStoreService,
    private readonly orphans: StorageOrphansService,
  ) {}

  // Прежняя загрузка одним сырым телом — до перехода web на части (ADR-0165).
  upload(
    body: unknown,
    createdBy: string | undefined,
    now: DateTime,
  ): Promise<ExamVideoDto> {
    const { model, fileStore, orphans } = this;
    return storeRawExamVideo({ model, fileStore, orphans }, body, createdBy, now);
  }

  /** Вызывает вызывающий слой (ExamItemsService) перед записью вопроса/
   * варианта с `videoId` — сохранить ссылку на видео, которого нет, значило
   * бы молчаливо сломать показ (тот же приём, что ExamImagesService.assertExist). */
  async assertExist(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    if (unique.some((id) => !Types.ObjectId.isValid(id))) {
      throw new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    }
    const found = await this.model
      .find({ _id: { $in: unique } }, { status: 1 })
      .lean<Pick<RawLeanExamVideo, 'status'>[]>();
    if (found.length !== unique.length) {
      throw new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    }
    // Есть, но ещё грузится — не «не найдено»: учителю нужно дождаться, а не
    // загружать заново.
    if (!found.every(isExamVideoReady)) {
      throw new InvalidInputError(EXAM_VIDEO_UPLOADING_MESSAGE);
    }
  }

  /** Штат — по роли (данные школы, ADR-0010). Ученик — только если видео
   * стоит в снимке ЕГО попытки: тот же 404, что у несуществующего id — не
   * подтверждаем даже факт существования чужого видео (SECURITY §3). Общая
   * проверка для HTTP (signedUrl) и бота (loadForBot) — вторую проверку не
   * пишем, доступ у обоих один и тот же. */
  private async loadAccessibleDoc(id: string, user: UserLean): Promise<RawLeanExamVideo> {
    assertObjectId(id, EXAM_VIDEO_NOT_FOUND_MESSAGE);
    if (!isStaffRole(user.roles)) {
      const owns = await this.attemptModel.exists({ userId: user.id, videoIds: id });
      if (!owns) throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    }
    const doc = await this.model.findById(id).lean<RawLeanExamVideo | null>();
    if (!doc || !isExamVideoReady(doc)) {
      throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    }
    return doc;
  }

  async signedUrl(
    id: string,
    user: UserLean,
    now: DateTime,
    options: VideoUrlOptions = VIEW_VIDEO,
  ): Promise<string> {
    const doc = await this.loadAccessibleDoc(id, user);
    return signedVideoUrl({ fileStore: this.fileStore, doc, now, options });
  }

  /** Бот скачивает байты сам и шлёт их в Telegram, не редиректом на подписанную
   * ссылку (2026-09-27, «Уточнено» ADR-0133). `NotAvailableError` (R2 выключен,
   * объект пропал — FileStoreService.get) бросает уже `loadBytes()`, не этот метод:
   * отправитель (exam-question-video-send.ts) считает это деградацией, не отказом. */
  async loadForBot(id: string, user: UserLean, now: DateTime): Promise<LoadedExamVideo> {
    const doc = await this.loadAccessibleDoc(id, user);
    const { telegramFileId } = decryptExamVideo(doc);
    const loadBytes = () =>
      this.bytesInFlight.run(id, () => this.fileStore.get(doc.key, now));
    return { loadBytes, contentType: readyContentType(doc), telegramFileId };
  }

  /** Кэш file_id после удачной отправки в бот — тот же приём, что
   * ExamImagesService.rememberTelegramFileId: невалидный id молча
   * пропускаем, вызывающий код уже прошёл loadForBot с тем же id. */
  async rememberTelegramFileId(id: string, fileId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.updateOne(
      { _id: id },
      { $set: encryptRecord({ telegramFileId: fileId }, EXAM_VIDEO_ENCRYPT_SCHEMA) },
    );
  }
}
