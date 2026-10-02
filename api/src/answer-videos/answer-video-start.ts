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
import { Injectable } from '@nestjs/common';
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
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { AnswerVideoRecord, type RawLeanAnswerVideo } from './answer-video.schema';

// Каталог ключей в R2 — случайный `answer-videos/<uuid>`, не персональные данные.
const ANSWER_VIDEO_KEY_PREFIX = 'answer-videos';

@Injectable()
export class AnswerVideoStartService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly fileStore: FileStoreService,
    private readonly uploads: VideoUploadsService,
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

    // Резюме или новая загрузка — ядро (ADR-0165); здесь только то, чьё это
    // видео и к какому вопросу.
    return this.uploads.start(this.model, {
      existing,
      sizeBytes: input.sizeBytes,
      fingerprint: input.fingerprint,
      keyPrefix: ANSWER_VIDEO_KEY_PREFIX,
      create: (state) =>
        this.model.create({
          userId: new Types.ObjectId(userId),
          attemptId: new Types.ObjectId(attemptId),
          itemId: new Types.ObjectId(input.itemId),
          ...state,
        }),
      now,
    });
  }
}
