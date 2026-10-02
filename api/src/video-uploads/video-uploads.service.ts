// Ядро загрузки видео частями (ADR-0165): одна механика для `answer_videos` и
// (дальше) `exam_videos`. Домен — владелец коллекции — передаёт свою модель,
// наследующую VideoUploadRecord, и сам решает, кто вправе, что считать «той же»
// загрузкой, что делать с готовым файлом и как долго его хранить. Ядро не знает
// ни попыток, ни вопросов, ни ролей.
//
// Модель — аргумент метода, а не зависимость класса: Nest внедряет по классу, а
// одна и та же логика обслуживает разные модели. Внутри — функции с явным
// набором зависимостей (video-upload-*.ts), класс только держит три адаптера
// хранилища и раздаёт их.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { AnswerVideoUploadDto } from '@xuanxue/shared';
import { MultipartStoreService } from '../storage/multipart-store.service';
import { ObjectHeadService } from '../storage/object-head.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { assembleVideoUpload } from './video-upload-assemble';
import { uploadVideoPart, type UploadPartInput } from './video-upload-part';
import { sweepStaleUploads, type SweepStaleInput } from './video-upload-stale';
import { startVideoUpload, type StartUploadInput } from './video-upload-start';
import type { RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';

@Injectable()
export class VideoUploadsService {
  constructor(
    private readonly multipart: MultipartStoreService,
    private readonly objectHead: ObjectHeadService,
    private readonly orphans: StorageOrphansService,
  ) {}

  /** Начать загрузку или продолжить ту же (resume), убрав прежнюю другую. */
  start<T extends VideoUploadRecord>(
    model: Model<T>,
    input: StartUploadInput,
  ): Promise<AnswerVideoUploadDto> {
    return startVideoUpload({ model, ...this.storage() }, input);
  }

  uploadPart<T extends VideoUploadRecord>(
    model: Model<T>,
    input: UploadPartInput,
  ): Promise<AnswerVideoUploadDto> {
    return uploadVideoPart({ model, multipart: this.multipart }, input);
  }

  /** Собрать файл в R2 (повторяемо, F47); дальше — шаги домена. */
  assemble<T extends VideoUploadRecord>(
    model: Model<T>,
    doc: RawLeanVideoUpload,
    uploadId: string,
    now: DateTime,
  ): Promise<void> {
    return assembleVideoUpload({ model, ...this.storage() }, doc, uploadId, now);
  }

  /** Убрать брошенные `uploading`; возвращает, сколько убрано. */
  sweepStale<T extends VideoUploadRecord>(
    model: Model<T>,
    input: SweepStaleInput,
  ): Promise<number> {
    return sweepStaleUploads({ model, ...this.storage() }, input);
  }

  private storage(): {
    multipart: MultipartStoreService;
    objectHead: ObjectHeadService;
    orphans: StorageOrphansService;
  } {
    return {
      multipart: this.multipart,
      objectHead: this.objectHead,
      orphans: this.orphans,
    };
  }
}
