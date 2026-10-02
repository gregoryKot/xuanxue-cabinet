// Загрузка видео вопроса частями (ADR-0165): старт → части → complete, тем же
// ядром video-uploads/, что и видео-ответ ученика. Здесь то, что про школу: кто
// вправе (штат — роль на контроллере; продолжает загрузку только тот, кто её
// начал, — `createdBy`) и что с готовым файлом (видео становится `ready`; ссылка
// на него — дело вопроса банка, не этого сервиса).
//
// Учитель может грузить несколько клипов разом (вопрос и варианты): чужие
// незаконченные загрузки того же человека не убираются, продолжается только
// загрузка того же файла (размер + отпечаток) — в отличие от видео-ответа, где
// «то же место» одно.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import {
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  EXAM_VIDEO_LIMITS,
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  EXAM_VIDEO_TOO_LARGE_MESSAGE,
  FILE_STORAGE_OFF_MESSAGE,
  type ExamVideoDto,
  type StartExamVideoInput,
  type VideoUploadDto,
} from '@xuanxue/shared';
import {
  ConflictError,
  InvalidInputError,
  NotAvailableError,
  NotFoundError,
} from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { FileStoreService } from '../storage/file-store.service';
import { assertAllPartsReceived } from '../video-uploads/video-upload-assemble';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { toExamVideoDto, type RawLeanExamVideo } from './exam-video.mapper';
import { ExamVideoRecord } from './exam-video.schema';

// Каталог ключей в R2 — случайный `exam-videos/<uuid>`, как у сырой загрузки.
const EXAM_VIDEO_KEY_PREFIX = 'exam-videos';

@Injectable()
export class ExamVideoUploadsService {
  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
    private readonly fileStore: FileStoreService,
    private readonly uploads: VideoUploadsService,
  ) {}

  async start(
    userId: string,
    input: StartExamVideoInput,
    now: DateTime,
  ): Promise<VideoUploadDto> {
    if (!this.fileStore.isEnabled) {
      throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
    }
    if (input.sizeBytes > EXAM_VIDEO_LIMITS.maxBytes) {
      throw new InvalidInputError(EXAM_VIDEO_TOO_LARGE_MESSAGE);
    }
    const createdBy = new Types.ObjectId(userId);
    const existing = await this.model
      .findOne({
        createdBy,
        status: 'uploading',
        sizeBytes: input.sizeBytes,
        fingerprint: input.fingerprint,
      })
      .lean<RawLeanExamVideo | null>();
    return this.uploads.start(this.model, {
      existing,
      sizeBytes: input.sizeBytes,
      fingerprint: input.fingerprint,
      keyPrefix: EXAM_VIDEO_KEY_PREFIX,
      create: (state) => this.model.create({ createdBy, ...state }),
      now,
    });
  }

  async uploadPart(
    id: string,
    userId: string,
    partNumber: number,
    body: unknown,
    now: DateTime,
  ): Promise<VideoUploadDto> {
    const doc = await this.loadOwn(id, userId);
    return this.uploads.uploadPart(this.model, { doc, partNumber, body, now });
  }

  async complete(id: string, userId: string, now: DateTime): Promise<ExamVideoDto> {
    const doc = await this.loadOwn(id, userId);
    // Готовое видео на повторе отдаёт тот же ответ: ответ первого вызова мог
    // потеряться по дороге (F47, ADR-0165).
    if (doc.status !== 'uploading') return toExamVideoDto(doc);
    if (!doc.uploadId) throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    assertAllPartsReceived(doc);
    await this.uploads.assemble(this.model, doc, doc.uploadId, now);
    // Условный переход: из двух параллельных `complete` его делает один; ответ
    // оба строят из одной записи.
    await this.model.updateOne(
      { _id: doc._id, status: 'uploading' },
      {
        $set: { status: 'ready', completedAt: now.toJSDate(), parts: [] },
        $unset: { uploadId: 1, r2CompletedAt: 1 },
      },
    );
    const ready = await this.model.findById(doc._id).lean<RawLeanExamVideo | null>();
    if (!ready) throw new Error('ExamVideoUploadsService.complete: запись пропала');
    return toExamVideoDto(ready);
  }

  /** Своя загрузка или 404: чужая и несуществующая отвечают одинаково
   * (SECURITY §3). */
  private async loadOwn(id: string, userId: string): Promise<RawLeanExamVideo> {
    assertObjectId(id, EXAM_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanExamVideo | null>();
    if (!doc || doc.createdBy?.toString() !== userId) {
      throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    }
    return doc;
  }
}
