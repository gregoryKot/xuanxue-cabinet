// Сборка видео-ответа в R2 на `complete` (ADR-0137, повторяемость — ADR-0165):
// CompleteMultipartUpload и отметка `r2CompletedAt` в документе. Вынесено из
// AnswerVideoCompleteService: у того уже занят потолок файл-храповика.
//
// Почему повторяемо (аудит 2026-10-01, F47). R2 собирает загрузку один раз:
// второй вызов отвечает NoSuchUpload. Если после сборки упала Mongo, клиент
// повторял `complete`, получал 503 и крутился в «Связь пропала» вечно, хотя файл
// лежал в R2, а `media_assets` не было. Теперь после ответа R2 пишется отметка,
// и повтор шаг в R2 пропускает. А если не записалась и сама отметка, NoSuchUpload
// разбирается проверкой объекта: он лежит с нужным размером — значит, собран.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { MultipartStoreService } from '../storage/multipart-store.service';
import { ObjectHeadService } from '../storage/object-head.service';
import { MultipartUploadGoneError } from '../storage/r2-errors';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import type { RawLeanAnswerVideo } from './answer-video.mapper';
import { AnswerVideoRecord } from './answer-video.schema';

@Injectable()
export class AnswerVideoAssembleService {
  private readonly logger = new Logger(AnswerVideoAssembleService.name);

  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    private readonly multipart: MultipartStoreService,
    private readonly objectHead: ObjectHeadService,
    private readonly orphans: StorageOrphansService,
  ) {}

  /** После вызова файл гарантированно лежит в R2, а в документе стоит
   * `r2CompletedAt`. Журнал сирот отпускается тут же: с отметкой владелец
   * ключа — сам документ `uploading`, и уборщик брошенных загрузок
   * (AnswerVideoSweepService) убирает ключ вместе с ним. Оставь ключ в журнале —
   * он через сутки удалил бы собранный файл у ученика, вернувшегося позже. */
  async assemble(
    doc: RawLeanAnswerVideo,
    uploadId: string,
    now: DateTime,
  ): Promise<void> {
    if (!doc.r2CompletedAt) {
      await this.assembleInStorage(doc, uploadId, now);
      await this.model.updateOne(
        { _id: doc._id },
        { $set: { r2CompletedAt: now.toJSDate() } },
      );
    }
    await this.orphans.forget(doc.key);
  }

  private async assembleInStorage(
    doc: RawLeanAnswerVideo,
    uploadId: string,
    now: DateTime,
  ): Promise<void> {
    // ADR-0079: журнал раньше завершения — ключ уже создан на старте, но
    // отметить его снова (upsert) перед решающим шагом безопаснее, чем
    // положиться на запись недельной давности.
    await this.orphans.track(doc.key);
    try {
      await this.multipart.completeMultipartUpload({
        key: doc.key,
        uploadId,
        parts: [...doc.parts]
          .sort((a, b) => a.n - b.n)
          .map((part) => ({ partNumber: part.n, etag: part.etag })),
        now,
      });
    } catch (err) {
      if (!(err instanceof MultipartUploadGoneError)) throw err;
      // Загрузки нет, а объекта с нужным размером тоже нет — это настоящая
      // потеря, ошибка уходит как раньше, а не прячется.
      if ((await this.objectHead.sizeBytes(doc.key, now)) !== doc.sizeBytes) throw err;
      this.logger.warn('R2 уже собрал файл, отметка не записалась — продолжаем (F47)');
    }
  }
}
