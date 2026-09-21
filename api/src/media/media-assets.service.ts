// Видео экзамена — создание и чтение media_assets (ADR-0023, PLAN §11 слой
// 4.5, ADR-0037 — видео отвечает вопросу, не попытке целиком). Три пути
// привязки: бот по file_id (attachTelegramVideo, проверяет владение попыткой
// — SECURITY §3), ссылка от ученика (addLink, тоже по владению) и ручная
// отметка учителя (addManual — роль проверяет контроллер, владельца попытки
// сервис берёт сам: media_assets.userId обязан совпадать с exam_attempts.userId,
// иначе удаление аккаунта ученика потеряло бы запись).
//
// `itemId`, если передан, обязан быть video-вопросом снимка (isVideoItemInSnapshot,
// media-item-lookup.ts) — владелец и снимок приходят одним запросом
// (loadAttemptOwnerInfo, media-attempt-owner.ts, вынесено ради файл-лимита).
//
// addLink — исключение: повторная ссылка на тот же вопрос заменяет прежнюю
// (upsertLinkMediaAsset, ADR-0086), пока попытку не проверили (graded).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamMediaNotifierRegistry } from './exam-media-notifier.registry';
import { insertMediaAsset } from './media-asset-insert';
import { loadAttemptOwnerInfo } from './media-attempt-owner';
import { isVideoItemInSnapshot } from './media-item-lookup';
import { addLinkMediaAsset } from './media-link-add';
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
    private readonly examMediaNotifiers: ExamMediaNotifierRegistry,
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

  /** Запасной путь — ссылка (ADR-0023), он же основной путь ответа с
   * ADR-0084. Проверки и запись — media-link-add.ts (файл-лимит CLAUDE.md),
   * здесь только DI: сервис остаётся точкой входа для контроллера и бота. */
  async addLink(
    attemptId: string,
    userId: string,
    url: string,
    now: DateTime,
    itemId?: string,
  ): Promise<ExamMediaDto> {
    return addLinkMediaAsset(
      {
        model: this.model,
        attemptModel: this.attemptModel,
        notifiers: this.examMediaNotifiers,
      },
      { attemptId, userId, url, now, itemId },
    );
  }

  /** Третий путь — учитель отмечает «принято» вручную (ADR-0023). Роль
   * проверяет контроллер (`@Roles`); владельца попытки сервис берёт сам —
   * см. комментарий в начале файла. `itemId` — та же проверка, что у addLink.
   * Уведомление не шлём (в отличие от addLink) — отметку ставит сам учитель,
   * сообщать ему же о его собственном действии незачем. */
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
}
