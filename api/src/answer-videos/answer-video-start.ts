// POST /attempts/:id/answer-video (ADR-0137) — начать или продолжить
// загрузку. Вынесено из AnswerVideosService (файл-лимит CLAUDE.md
// «Храповики»), тем же приёмом, что media-link-add.ts: владение и статус
// проверяются здесь, сама запись документа — тоже здесь, DI остаётся в
// сервисе.
//
// Порядок проверок — тот же, что addLinkMediaAsset: владение (SECURITY §3),
// вопрос (ADR-0037), статус попытки, и только потом хранилище/размер —
// чужому attemptId и несуществующему отвечаем одинаково раньше, чем
// раскрываем что-либо о хранилище.
import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_TOO_LARGE_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  FILE_STORAGE_OFF_MESSAGE,
  type AnswerVideoUploadDto,
  type StartAnswerVideoInput,
} from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import {
  ConflictError,
  InvalidInputError,
  NotAvailableError,
  NotFoundError,
} from '../common/errors';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { loadAttemptOwnerInfo } from '../media/media-attempt-owner';
import { isVideoItemInSnapshot } from '../media/media-item-lookup';
import { FileStoreService } from '../storage/file-store.service';
import { MultipartStoreService } from '../storage/multipart-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { toAnswerVideoUploadDto, type RawLeanAnswerVideo } from './answer-video.mapper';
import { AnswerVideoRecord } from './answer-video.schema';

@Injectable()
export class AnswerVideoStartService {
  private readonly logger = new Logger(AnswerVideoStartService.name);

  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly fileStore: FileStoreService,
    private readonly multipart: MultipartStoreService,
    private readonly orphans: StorageOrphansService,
  ) {}

  async start(
    attemptId: string,
    userId: string,
    input: StartAnswerVideoInput,
    now: DateTime,
  ): Promise<AnswerVideoUploadDto> {
    const owner = await loadAttemptOwnerInfo(this.attemptModel, attemptId);
    if (!owner || owner.userId !== userId) {
      throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    }
    if (!isVideoItemInSnapshot(owner.blocks, input.itemId)) {
      throw new NotFoundError(EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE);
    }
    // ADR-0086/ADR-0137: работу уже проверили — новую загрузку молча не
    // подменяем, тем же правилом, что у ссылки.
    if (owner.status === 'graded') {
      throw new ConflictError(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE);
    }
    if (!this.fileStore.isEnabled) {
      throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
    }
    if (input.sizeBytes > ANSWER_VIDEO_LIMITS.maxBytes) {
      throw new InvalidInputError(ANSWER_VIDEO_TOO_LARGE_MESSAGE);
    }

    const existing = await this.model
      .findOne({
        userId: new Types.ObjectId(userId),
        attemptId: new Types.ObjectId(attemptId),
        itemId: new Types.ObjectId(input.itemId),
        status: 'uploading',
      })
      .lean<RawLeanAnswerVideo | null>();

    if (
      existing &&
      existing.sizeBytes === input.sizeBytes &&
      existing.fingerprint === input.fingerprint
    ) {
      // Тот же файл к тому же вопросу — продолжаем (ADR-0137), не начинаем
      // новую загрузку и не открываем второй multipart в R2.
      return toAnswerVideoUploadDto(existing);
    }
    if (existing) {
      await this.discard(existing, now);
    }

    const key = `answer-videos/${randomUUID()}`;
    // Журнал сирот — раньше самого документа (ADR-0079): ключ выбран, но в
    // R2 ещё ничего нет (multipart откроется на первой части) — упади
    // создание документа прямо сейчас, ключ всё равно не потеряется.
    await this.orphans.track(key);
    const created = await this.model.create({
      userId: new Types.ObjectId(userId),
      attemptId: new Types.ObjectId(attemptId),
      itemId: new Types.ObjectId(input.itemId),
      sizeBytes: input.sizeBytes,
      fingerprint: input.fingerprint,
      key,
      status: 'uploading',
    });
    const doc = await this.model.findById(created._id).lean<RawLeanAnswerVideo>();
    if (!doc)
      throw new Error(
        'AnswerVideoStartService.start: запись не найдена сразу после создания',
      );
    return toAnswerVideoUploadDto(doc);
  }

  /** Другой файл к тому же вопросу пришёл заново (например, вкладку закрыли
   * и выбрали другое видео) — прежняя незаконченная загрузка ни к чему,
   * убираем best-effort: отказ хранилища не должен блокировать новую
   * попытку загрузить файл. */
  private async discard(existing: RawLeanAnswerVideo, now: DateTime): Promise<void> {
    if (existing.uploadId) {
      try {
        await this.multipart.abortMultipartUpload(existing.key, existing.uploadId, now);
      } catch (err) {
        this.logger.warn(
          `не удалось прервать прежнюю multipart-загрузку: ${errorMessage(err)}`,
        );
      }
    }
    await this.orphans.removeNow(existing.key, now);
    await this.model.deleteOne({ _id: existing._id });
  }
}
