// Видео экзамена — создание, чтение и снятие media_assets (ADR-0023, PLAN §11
// слой 4.5, ADR-0037 — видео отвечает вопросу, не попытке целиком, ADR-0086 —
// ошибочную запись снимает тот, кто её прислал). Три пути привязки: бот по
// file_id (attachTelegramVideo, проверяет владение попыткой — SECURITY §3),
// ссылка от ученика (addLink, тоже по владению) и ручная отметка учителя
// (addManual — роль проверяет контроллер, владельца попытки сервис берёт сам:
// media_assets.userId обязан совпадать с exam_attempts.userId, иначе удаление
// аккаунта ученика потеряло бы запись).
//
// `itemId`, если передан, обязан быть video-вопросом снимка (isVideoItemInSnapshot,
// media-item-lookup.ts) — владелец, снимок и статус приходят одним запросом
// (loadAttemptOwnerInfo, media-attempt-owner.ts, вынесено ради файл-лимита).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ALREADY_LINKED_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_LOCKED_AFTER_GRADING_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { ConflictError, InvalidInputError, NotFoundError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import { insertMediaAsset } from './media-asset-insert';
import { removeMediaAsset } from './media-asset-remove';
import { loadAttemptOwnerInfo } from './media-attempt-owner';
import { isVideoItemInSnapshot } from './media-item-lookup';
import {
  decryptMediaAsset,
  toExamMediaDto,
  type RawLeanMediaAsset,
} from './media-asset.mapper';
import { MediaAssetRecord } from './media-asset.schema';

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

  /** Привязка видео из бота — только владельцу попытки (SECURITY §3,
   * ADR-0023). Чужой attemptId, отправитель без аккаунта или itemId не
   * video-вопроса снимка (ADR-0037) — везде `null`, без уточнения причины. */
  async attachTelegramVideo(
    attemptId: string,
    userId: string | undefined,
    source: TelegramVideoSource,
    now: DateTime,
    itemId?: string,
  ): Promise<AttachedTelegramMedia | null> {
    if (!userId) return null;
    const owner = await loadAttemptOwnerInfo(this.attemptModel, attemptId);
    if (!owner || owner.userId !== userId) return null;
    if (itemId !== undefined && !isVideoItemInSnapshot(owner.blocks, itemId)) return null;

    const media = await insertMediaAsset(this.model, {
      attemptId,
      userId,
      itemId,
      kind: 'telegram',
      fileId: source.fileId,
      fileUniqueId: source.fileUniqueId,
      durationSec: source.durationSec,
      sizeBytes: source.sizeBytes,
      receivedAt: now,
    });
    return { media, examTitle: owner.examTitle };
  }

  /** Запасной путь — ссылка (ADR-0023), владелец из сессии (SECURITY §3):
   * чужой attemptId — тот же отказ, что несуществующий. itemId не
   * video-вопроса снимка (ADR-0037) — здесь есть кому объяснить причину,
   * в отличие от бота. После `graded` — отказ (ADR-0086): оценка опирается
   * ровно на то, что видел учитель, дослать ссылку уже нельзя. */
  async addLink(
    attemptId: string,
    userId: string,
    url: string,
    now: DateTime,
    itemId?: string,
  ): Promise<ExamMediaDto> {
    const owner = await loadAttemptOwnerInfo(this.attemptModel, attemptId);
    if (!owner || owner.userId !== userId) {
      throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    }
    if (owner.status === 'graded') {
      throw new InvalidInputError(EXAM_MEDIA_LOCKED_AFTER_GRADING_MESSAGE);
    }
    if (itemId !== undefined && !isVideoItemInSnapshot(owner.blocks, itemId)) {
      throw new NotFoundError(EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE);
    }

    try {
      return await insertMediaAsset(this.model, {
        attemptId,
        userId,
        itemId,
        kind: 'link',
        url,
        receivedAt: now,
      });
    } catch (err) {
      if (isDuplicateKeyError(err))
        throw new ConflictError(EXAM_MEDIA_ALREADY_LINKED_MESSAGE);
      throw err;
    }
  }

  /** Третий путь — учитель отмечает «принято» вручную (ADR-0023). Роль
   * проверяет контроллер (`@Roles`); владельца попытки сервис берёт сам —
   * см. комментарий в начале файла. `itemId` — та же проверка, что у addLink. */
  async addManual(
    attemptId: string,
    note: string | undefined,
    now: DateTime,
    itemId?: string,
  ): Promise<ExamMediaDto> {
    const owner = await loadAttemptOwnerInfo(this.attemptModel, attemptId);
    if (!owner) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    if (itemId !== undefined && !isVideoItemInSnapshot(owner.blocks, itemId)) {
      throw new NotFoundError(EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE);
    }

    return insertMediaAsset(this.model, {
      attemptId,
      userId: owner.userId,
      itemId,
      kind: 'manual',
      note,
      receivedAt: now,
    });
  }

  /** Снять ошибочную запись (ADR-0086). Правила «кто что может снять» и само
   * удаление — media-asset-remove.ts, здесь только точка входа сервиса. */
  remove(attemptId: string, mediaId: string, user: UserLean): Promise<void> {
    return removeMediaAsset({
      model: this.model,
      attemptModel: this.attemptModel,
      attemptId,
      mediaId,
      user,
    });
  }
}
