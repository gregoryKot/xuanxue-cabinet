// Загрузка записи занятия частями (ADR-0180, ADR-0165): старт → части → complete,
// тем же ядром video-uploads/, что видео вопроса и видео-ответ. Здесь то, что про
// школу: кто вправе (штат — роль на контроллере; продолжает загрузку только тот, кто
// её начал, — `createdBy`) и что с готовым файлом (видео становится `ready`; ссылка
// на него — дело записи занятия, не этого сервиса).
//
// Учитель может держать несколько незаконченных загрузок (две записи за день):
// продолжается только загрузка того же файла (размер + отпечаток), чужие не трогаются.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import {
  FILE_STORAGE_OFF_MESSAGE,
  LESSON_VIDEO_LIMITS,
  LESSON_VIDEO_NOT_FOUND_MESSAGE,
  LESSON_VIDEO_TOO_LARGE_MESSAGE,
  type LessonVideoDto,
  type StartLessonVideoInput,
  type VideoUploadDto,
} from '@xuanxue/shared';
import { InvalidInputError, NotAvailableError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { FileStoreService } from '../storage/file-store.service';
import { StaffVideoUploads } from '../video-uploads/staff-video-uploads';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { toLessonVideoDto, type RawLeanLessonVideo } from './lesson-video.mapper';
import { LessonVideoRecord } from './lesson-video.schema';

// Каталог ключей в R2 — случайный `lesson-videos/<uuid>`.
const LESSON_VIDEO_KEY_PREFIX = 'lesson-videos';

@Injectable()
export class LessonVideoUploadsService extends StaffVideoUploads<
  LessonVideoRecord,
  RawLeanLessonVideo
> {
  constructor(
    @InjectModel(LessonVideoRecord.name)
    protected readonly model: Model<LessonVideoRecord>,
    private readonly fileStore: FileStoreService,
    protected readonly uploads: VideoUploadsService,
  ) {
    super();
  }

  async start(
    userId: string,
    input: StartLessonVideoInput,
    now: DateTime,
  ): Promise<VideoUploadDto> {
    if (!this.fileStore.isEnabled) {
      throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
    }
    if (input.sizeBytes > LESSON_VIDEO_LIMITS.maxBytes) {
      throw new InvalidInputError(LESSON_VIDEO_TOO_LARGE_MESSAGE);
    }
    const createdBy = new Types.ObjectId(userId);
    const { sizeBytes, fingerprint } = input;
    const existing = await this.model
      .findOne({ createdBy, status: 'uploading', sizeBytes, fingerprint })
      .lean<RawLeanLessonVideo | null>();
    return this.uploads.start(this.model, {
      existing,
      sizeBytes,
      fingerprint,
      keyPrefix: LESSON_VIDEO_KEY_PREFIX,
      create: (state) => this.model.create({ createdBy, ...state }),
      now,
    });
  }

  async complete(
    id: string,
    userId: string,
    now: DateTime,
    posterBase64?: string,
  ): Promise<LessonVideoDto> {
    return toLessonVideoDto(await this.completeOwn(id, userId, now, posterBase64));
  }

  /** Своя загрузка или 404: чужая и несуществующая отвечают одинаково
   * (SECURITY §3). */
  protected async loadOwn(id: string, userId: string): Promise<RawLeanLessonVideo> {
    assertObjectId(id, LESSON_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanLessonVideo | null>();
    if (!doc || doc.createdBy?.toString() !== userId) {
      throw new NotFoundError(LESSON_VIDEO_NOT_FOUND_MESSAGE);
    }
    return doc;
  }
}
