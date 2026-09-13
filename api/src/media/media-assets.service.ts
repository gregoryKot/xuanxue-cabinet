// Видео экзамена — создание и чтение media_assets (ADR-0023, PLAN §11 слой
// 4.5). Три пути привязки: бот по file_id (attachTelegramVideo, проверяет
// владение попыткой — SECURITY §3), ссылка от ученика (addLink, тоже по
// владению) и ручная отметка учителя (addManual — роль проверяет контроллер,
// владельца попытки сервис берёт сам: media_assets.userId обязан совпадать с
// exam_attempts.userId, иначе удаление аккаунта ученика потеряло бы запись).
//
// Читает ExamAttemptRecord напрямую (через ExamAttemptModelModule, не через
// ExamsModule целиком — ADR-0013, циклов не заводим: ExamsModule сам
// импортирует MediaModule ради ExamAttemptDto.media/AttemptReviewDto.media).
// `decrypt(examTitle)` — точечно, не через decryptAttempt(exam-attempt.mapper.ts):
// тому нужны blocks/answers, которых здесь не выбирали.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ALREADY_LINKED_MESSAGE,
  type ExamMediaDto,
  type ExamMediaKind,
} from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { decrypt, encryptRecord } from '../utils/encryption';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import {
  decryptMediaAsset,
  toExamMediaDto,
  type RawLeanMediaAsset,
} from './media-asset.mapper';
import { MEDIA_ASSET_ENCRYPT_SCHEMA, MediaAssetRecord } from './media-asset.schema';

interface AttemptOwnerInfo {
  userId: string;
  examTitle: string;
}

export interface TelegramVideoSource {
  fileId: string;
  fileUniqueId: string;
  durationSec?: number;
  sizeBytes?: number;
}

export interface AttachedTelegramMedia {
  media: ExamMediaDto;
  examTitle: string;
}

interface InsertPayload {
  attemptId: string;
  userId: string;
  kind: ExamMediaKind;
  fileId?: string;
  fileUniqueId?: string;
  url?: string;
  durationSec?: number;
  sizeBytes?: number;
  note?: string;
  receivedAt: DateTime;
}

@Injectable()
export class MediaAssetsService {
  constructor(
    @InjectModel(MediaAssetRecord.name) private readonly model: Model<MediaAssetRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
  ) {}

  async listForAttempt(attemptId: string): Promise<ExamMediaDto[]> {
    const map = await this.listForAttempts([attemptId]);
    return map.get(attemptId) ?? [];
  }

  /** Один запрос на список попыток (учитель, `GET /attempts`) — не N+1. */
  async listForAttempts(attemptIds: string[]): Promise<Map<string, ExamMediaDto[]>> {
    const ids = attemptIds.filter((id) => Types.ObjectId.isValid(id));
    const byAttempt = new Map<string, ExamMediaDto[]>();
    if (ids.length === 0) return byAttempt;

    const docs = await this.model
      .find({ attemptId: { $in: ids } })
      .sort({ receivedAt: -1 })
      .lean<RawLeanMediaAsset[]>();
    for (const doc of docs) {
      const key = doc.attemptId.toString();
      const dto = toExamMediaDto(decryptMediaAsset(doc));
      byAttempt.set(key, [...(byAttempt.get(key) ?? []), dto]);
    }
    return byAttempt;
  }

  /** Привязка видео из бота — только если попытка принадлежит тому самому
   * пользователю Telegram, что прислал видео (SECURITY §3, ADR-0023). Чужой,
   * несуществующий `attemptId`, как и отправитель без привязанного аккаунта
   * (нет `userId`) — `null`, без уточнения причины: не подтверждаем
   * существование чужой попытки. */
  async attachTelegramVideo(
    attemptId: string,
    userId: string | undefined,
    source: TelegramVideoSource,
    now: DateTime,
  ): Promise<AttachedTelegramMedia | null> {
    if (!userId) return null;
    const owner = await this.ownerInfo(attemptId);
    if (!owner || owner.userId !== userId) return null;

    const media = await this.insert({
      attemptId,
      userId,
      kind: 'telegram',
      fileId: source.fileId,
      fileUniqueId: source.fileUniqueId,
      durationSec: source.durationSec,
      sizeBytes: source.sizeBytes,
      receivedAt: now,
    });
    return { media, examTitle: owner.examTitle };
  }

  /** Запасной путь — ссылка (ADR-0023). Владелец — из сессии, не из пути
   * (SECURITY §3): чужой `attemptId` получает тот же отказ, что
   * несуществующий, не 403 — не подтверждаем существование. */
  async addLink(
    attemptId: string,
    userId: string,
    url: string,
    now: DateTime,
  ): Promise<ExamMediaDto> {
    const owner = await this.ownerInfo(attemptId);
    if (!owner || owner.userId !== userId) {
      throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    }

    try {
      return await this.insert({ attemptId, userId, kind: 'link', url, receivedAt: now });
    } catch (err) {
      if (isDuplicateKeyError(err))
        throw new ConflictError(EXAM_MEDIA_ALREADY_LINKED_MESSAGE);
      throw err;
    }
  }

  /** Третий путь — учитель отмечает «принято» вручную (ADR-0023). Роль
   * проверяет контроллер (`@Roles`); владельца попытки сервис берёт сам —
   * см. комментарий в начале файла. */
  async addManual(
    attemptId: string,
    note: string | undefined,
    now: DateTime,
  ): Promise<ExamMediaDto> {
    const owner = await this.ownerInfo(attemptId);
    if (!owner) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);

    return this.insert({
      attemptId,
      userId: owner.userId,
      kind: 'manual',
      note,
      receivedAt: now,
    });
  }

  private async ownerInfo(attemptId: string): Promise<AttemptOwnerInfo | null> {
    if (!Types.ObjectId.isValid(attemptId)) return null;
    const doc = await this.attemptModel
      .findById(attemptId, { userId: 1, examTitle: 1 })
      .lean<{ userId: Types.ObjectId; examTitle: string } | null>();
    if (!doc) return null;
    return {
      userId: doc.userId.toString(),
      examTitle: decrypt(doc.examTitle) ?? doc.examTitle,
    };
  }

  private async insert(data: InsertPayload): Promise<ExamMediaDto> {
    const payload = encryptRecord(
      {
        attemptId: new Types.ObjectId(data.attemptId),
        userId: new Types.ObjectId(data.userId),
        kind: data.kind,
        fileId: data.fileId,
        fileUniqueId: data.fileUniqueId,
        url: data.url,
        durationSec: data.durationSec,
        sizeBytes: data.sizeBytes,
        note: data.note,
        receivedAt: data.receivedAt.toJSDate(),
      },
      MEDIA_ASSET_ENCRYPT_SCHEMA,
    );
    const created = await this.model.create(payload);
    const doc = await this.model.findById(created._id).lean<RawLeanMediaAsset>();
    if (!doc)
      throw new Error(
        'MediaAssetsService.insert: запись не найдена сразу после создания',
      );
    return toExamMediaDto(decryptMediaAsset(doc));
  }
}
