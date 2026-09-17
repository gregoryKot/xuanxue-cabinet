// Создание и чтение картинок вариантов ответа (ADR-0035, PLAN §11 слой 4.2).
// Данные школы (ADR-0010): штат видит любую картинку по роли, ученик —
// только ту, что стоит в снимке его собственной попытки
// (`exam_attempts.imageIds`, SECURITY §3) — плоское индексируемое поле,
// потому что сам снимок (`blocks`) зашифрован целиком и Mongo внутрь не
// видит. Модель попытки берётся через ExamAttemptModelModule, не через
// ExamsModule целиком — цикл (тот же приём, что MediaAssetsService,
// media-assets.service.ts): ExamsModule в следующем слое сам импортирует
// этот модуль ради проверки существования картинки у варианта.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EXAM_IMAGE_NOT_FOUND_MESSAGE,
  isStaffRole,
  type ExamImageContentType,
  type ExamImageDto,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { decryptBytes, encryptBytes } from '../utils/encryption-bytes';
import { encryptRecord } from '../utils/encryption';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import {
  binaryToBuffer,
  decryptExamImage,
  toExamImageDto,
  type RawLeanExamImage,
} from './exam-image.mapper';
import { parseExamImageUpload } from './exam-image-upload';
import { EXAM_IMAGE_ENCRYPT_SCHEMA, ExamImageRecord } from './exam-image.schema';

export interface LoadedExamImage {
  bytes: Buffer;
  contentType: ExamImageContentType;
  /** Кэш file_id Telegram, если картинку уже отправляли в бот (слой 4б.2,
   * ADR-0035) — exam-question-album-send.ts. */
  telegramFileId?: string;
}

@Injectable()
export class ExamImagesService {
  constructor(
    @InjectModel(ExamImageRecord.name) private readonly model: Model<ExamImageRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
  ) {}

  async upload(body: unknown, createdBy: string): Promise<ExamImageDto> {
    const { bytes, contentType } = parseExamImageUpload(body);
    const created = await this.model.create({
      bytes: encryptBytes(bytes),
      contentType,
      sizeBytes: bytes.length,
      createdBy: new Types.ObjectId(createdBy),
    });
    const doc = await this.model.findById(created._id).lean<RawLeanExamImage>();
    if (!doc) {
      throw new Error('ExamImagesService.upload: запись не найдена сразу после создания');
    }
    return toExamImageDto(doc);
  }

  /** Вызывает вызывающий слой (ExamItemsService) перед записью варианта с
   * `imageId` — сохранить ссылку на картинку, которой нет, значило бы
   * молчаливо сломать показ (ADR-0035). `ids` уже нормализован вызывающим
   * (`collectImageIds`) — здесь дедуп на всякий случай, не входной контракт.
   * Невалидный ObjectId сюда дойти не должен (DTO `@IsMongoId()`), но
   * `Types.ObjectId.isValid` — тот же отказ, а не CastError наружу. */
  async assertExist(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    if (unique.some((id) => !Types.ObjectId.isValid(id))) {
      throw new InvalidInputError(EXAM_IMAGE_NOT_FOUND_MESSAGE);
    }
    const found = await this.model.countDocuments({ _id: { $in: unique } });
    if (found !== unique.length) {
      throw new InvalidInputError(EXAM_IMAGE_NOT_FOUND_MESSAGE);
    }
  }

  /** Штат — по роли (данные школы, ADR-0010). Ученик — только если картинка
   * стоит в снимке ЕГО попытки: тот же 404, что у несуществующего id — не
   * подтверждаем даже факт существования чужой картинки (SECURITY §3). */
  async load(id: string, user: UserLean): Promise<LoadedExamImage> {
    assertObjectId(id, EXAM_IMAGE_NOT_FOUND_MESSAGE);
    if (!isStaffRole(user.roles)) {
      const owns = await this.attemptModel.exists({ userId: user.id, imageIds: id });
      if (!owns) throw new NotFoundError(EXAM_IMAGE_NOT_FOUND_MESSAGE);
    }
    const doc = await this.model.findById(id).lean<RawLeanExamImage | null>();
    if (!doc) throw new NotFoundError(EXAM_IMAGE_NOT_FOUND_MESSAGE);
    const decrypted = decryptExamImage(doc);
    return {
      bytes: decryptBytes(binaryToBuffer(doc.bytes)),
      contentType: doc.contentType,
      telegramFileId: decrypted.telegramFileId,
    };
  }

  /** Кэш file_id после удачной отправки в бот (слой 4б.2, ADR-0035) —
   * фоновая оптимизация, не пользовательское действие: невалидный id молча
   * пропускаем, не бросаем (вызывающий — exam-question-album-send.ts — уже
   * прошёл load() с тем же id, значит он валиден; проверка — защита в
   * глубину, не рабочий путь). */
  async rememberTelegramFileId(id: string, fileId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.updateOne(
      { _id: id },
      { $set: encryptRecord({ telegramFileId: fileId }, EXAM_IMAGE_ENCRYPT_SCHEMA) },
    );
  }
}
