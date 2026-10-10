// Отдача видео вопроса/варианта: подписанная ссылка, кадр-превью, бот (ADR-0133,
// слой 4.2 вслед за картинками, exam-images.service.ts). Байты идут в R2, а не в
// MongoDB — сам файл существенно больше картинки (до 50 МБ), Atlas M0 их бы
// не потянул (ADR-0057, тот же довод, что у файлов материалов). Загрузка
// частями — exam-video-uploads.service.ts (ADR-0165). Кому и какое видео можно
// брать по id, и готово ли оно, — exam-video-access.ts.
//
// Модель попытки берётся через ExamAttemptModelModule, не через ExamsModule
// целиком — цикл (тот же приём, что ExamImagesService).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { SingleFlight } from '../common/single-flight';
import { encryptRecord } from '../utils/encryption';
import { FileStoreService } from '../storage/file-store.service';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import { SignedVideoService } from '../video-uploads/signed-video.service';
import { assertExamVideosReady, loadAccessibleExamVideo } from './exam-video-access';
import {
  decryptExamVideo,
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
export class ExamVideosService extends SignedVideoService<UserLean, RawLeanExamVideo> {
  // Один объект R2 за раз на видео (F02, комментарий у LoadedExamVideo).
  private readonly bytesInFlight = new SingleFlight<Buffer>();

  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    fileStore: FileStoreService,
  ) {
    super(fileStore);
  }

  // Проверка наличия и готовности — exam-video-access.ts.
  assertExist(ids: readonly string[]): Promise<void> {
    return assertExamVideosReady(this.model, ids);
  }

  protected loadAccessibleDoc(
    id: string,
    user: UserLean,
    fields?: string,
  ): Promise<RawLeanExamVideo> {
    const { model, attemptModel } = this;
    return loadAccessibleExamVideo({ model, attemptModel }, id, user, fields);
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
