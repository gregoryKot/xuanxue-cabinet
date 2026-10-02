// PUT /answer-videos/:id/parts/:n (ADR-0137) — принять одну часть файла.
// Вынесено из AnswerVideosService (файл-лимит CLAUDE.md «Храповики»).
//
// Заголовку `Content-Type` не верим (SECURITY §4): первая часть проходит
// `sniffVideoSignature`, и только её результат открывает multipart-загрузку
// в R2 — части после первой без неё не принимаются
// (ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE,
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_NOT_FOUND_MESSAGE,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  EXAM_VIDEO_EMPTY_MESSAGE,
  EXAM_VIDEO_UNSUPPORTED_MESSAGE,
  type AnswerVideoUploadDto,
} from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { assertObjectId } from '../common/object-id';
import { ConflictError, InvalidInputError, NotFoundError } from '../common/errors';
import { sniffVideoSignature } from '../common/raw-upload';
import { MultipartStoreService } from '../storage/multipart-store.service';
import {
  partCountFor,
  toAnswerVideoUploadDto,
  type RawLeanAnswerVideo,
} from './answer-video.mapper';
import { AnswerVideoRecord } from './answer-video.schema';

@Injectable()
export class AnswerVideoPartService {
  private readonly logger = new Logger(AnswerVideoPartService.name);

  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    private readonly multipart: MultipartStoreService,
  ) {}

  async uploadPart(
    id: string,
    userId: string,
    partNumber: number,
    body: unknown,
    now: DateTime,
  ): Promise<AnswerVideoUploadDto> {
    assertObjectId(id, ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanAnswerVideo | null>();
    if (!doc || doc.userId.toString() !== userId) {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    // r2CompletedAt: файл в R2 уже собран (ADR-0165) — часть 1 открыла бы
    // вторую загрузку на тот же ключ, и она осталась бы брошенной.
    if (doc.status !== 'uploading' || doc.r2CompletedAt) {
      throw new ConflictError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    }
    const partCount = partCountFor(doc.sizeBytes);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
      throw new InvalidInputError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    }
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new InvalidInputError(EXAM_VIDEO_EMPTY_MESSAGE);
    }
    const expectedLength =
      partNumber < partCount
        ? ANSWER_VIDEO_LIMITS.partBytes
        : doc.sizeBytes - ANSWER_VIDEO_LIMITS.partBytes * (partCount - 1);
    if (body.length !== expectedLength) {
      throw new InvalidInputError(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    }

    const uploadId =
      partNumber === 1 ? await this.openOrReuseUpload(doc, body, now) : doc.uploadId;
    if (!uploadId) {
      throw new ConflictError(ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE);
    }

    const etag = await this.multipart.uploadPart({
      key: doc.key,
      uploadId,
      partNumber,
      bytes: body,
      now,
    });
    await this.upsertPart(doc._id.toString(), partNumber, etag);

    const final = await this.model.findById(doc._id).lean<RawLeanAnswerVideo>();
    if (!final)
      throw new Error(
        'AnswerVideoPartService.uploadPart: запись пропала во время загрузки',
      );
    return toAnswerVideoUploadDto(final);
  }

  /** Первая часть открывает multipart в R2 сигнатурой сниффа, не заголовком
   * клиента. Условный апдейт `uploadId: { $exists: false }` страхует гонку
   * двух параллельных первых частей — проигравший прерывает свой multipart
   * и берёт uploadId победителя. */
  private async openOrReuseUpload(
    doc: RawLeanAnswerVideo,
    bytes: Buffer,
    now: DateTime,
  ): Promise<string | undefined> {
    const sniffed = sniffVideoSignature(bytes);
    if (!sniffed) throw new InvalidInputError(EXAM_VIDEO_UNSUPPORTED_MESSAGE);
    if (doc.uploadId) return doc.uploadId;

    const uploadId = await this.multipart.createMultipartUpload(doc.key, sniffed, now);
    const updated = await this.model
      .findOneAndUpdate(
        { _id: doc._id, uploadId: { $exists: false } },
        { $set: { uploadId, contentType: sniffed } },
      )
      .lean<RawLeanAnswerVideo | null>();
    if (updated) return uploadId;

    // Проиграли гонку — другой запрос уже открыл multipart раньше нас.
    try {
      await this.multipart.abortMultipartUpload(doc.key, uploadId, now);
    } catch (err) {
      this.logger.warn(`не удалось прервать проигравший multipart: ${errorMessage(err)}`);
    }
    const fresh = await this.model.findById(doc._id).lean<RawLeanAnswerVideo | null>();
    return fresh?.uploadId;
  }

  private async upsertPart(id: string, n: number, etag: string): Promise<void> {
    const replaced = await this.model.updateOne(
      { _id: id, 'parts.n': n },
      { $set: { 'parts.$.etag': etag } },
    );
    if (replaced.matchedCount === 0) {
      await this.model.updateOne({ _id: id }, { $push: { parts: { n, etag } } });
    }
  }
}
