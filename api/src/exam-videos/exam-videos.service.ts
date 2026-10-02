// Создание и чтение видео вопроса/варианта (ADR-0133, слой 4.2 вслед за
// картинками, exam-images.service.ts). Байты идут в R2, а не в MongoDB —
// сам файл существенно больше картинки (до 50 МБ), Atlas M0 их бы не
// потянул (ADR-0057, тот же довод, что у файлов материалов). Порядок шагов —
// ADR-0079: журнал (`track`) раньше объекта в R2, `forget` — после того, как
// на объект сослались (запись создана).
//
// Модель попытки берётся через ExamAttemptModelModule, не через ExamsModule
// целиком — цикл (тот же приём, что ExamImagesService).
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  isStaffRole,
  type ExamVideoContentType,
  type ExamVideoDto,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { SingleFlight } from '../common/single-flight';
import { VIEW_VIDEO, videoDownload, type VideoUrlOptions } from '../common/video-link';
import { encryptRecord } from '../utils/encryption';
import { FileStoreService } from '../storage/file-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import { parseExamVideoUpload } from './exam-video-upload';
import {
  decryptExamVideo,
  toExamVideoDto,
  type RawLeanExamVideo,
} from './exam-video.mapper';
import { EXAM_VIDEO_ENCRYPT_SCHEMA, ExamVideoRecord } from './exam-video.schema';

// Ссылка живёт час — дольше, чем у файла материала (десять минут, ADR-0057):
// файл скачивают один раз, а ролик плеер докачивает range-запросами по тому
// же подписанному адресу всё время, пока его смотрят и перематывают.
const SIGNED_URL_TTL_SECONDS = 3600;

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

  // createdBy необязателен — CLI-импорт сида грузит видео без вошедшего в
  // систему человека, схема поля не требует (required: false).
  async upload(
    body: unknown,
    createdBy: string | undefined,
    now: DateTime,
  ): Promise<ExamVideoDto> {
    const { bytes, contentType } = parseExamVideoUpload(body);
    const key = `exam-videos/${randomUUID()}`;
    await this.orphans.track(key);
    await this.fileStore.put({ key, bytes, contentType, now });

    const created = await this.model.create({
      key,
      contentType,
      sizeBytes: bytes.length,
      ...(createdBy !== undefined ? { createdBy: new Types.ObjectId(createdBy) } : {}),
    });
    await this.orphans.forget(key);
    const doc = await this.model.findById(created._id).lean<RawLeanExamVideo>();
    if (!doc) {
      throw new Error('ExamVideosService.upload: запись не найдена сразу после создания');
    }
    return toExamVideoDto(doc);
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
    const found = await this.model.countDocuments({ _id: { $in: unique } });
    if (found !== unique.length)
      throw new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
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
    if (!doc) throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    return doc;
  }

  async signedUrl(
    id: string,
    user: UserLean,
    now: DateTime,
    options: VideoUrlOptions = VIEW_VIDEO,
  ): Promise<string> {
    const doc = await this.loadAccessibleDoc(id, user);
    const download = videoDownload(options, doc.contentType);
    return this.fileStore.signedGetUrl(doc.key, SIGNED_URL_TTL_SECONDS, now, download);
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
    return { loadBytes, contentType: doc.contentType, telegramFileId };
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
