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
import type { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { UsersService } from '../users/users.service';
import { ExamVideoDeliveryRegistry } from './exam-video-delivery.registry';
import type { TelegramVideoSource, AttachedTelegramMedia } from './media-asset-insert';
import { insertMediaAsset, upsertLinkMediaAsset } from './media-asset-insert';
import { listMediaForAttempts } from './media-asset-list';
import { sendMediaToChat } from './media-asset-send';
import { loadAttemptOwnerInfo } from './media-attempt-owner';
import { isVideoItemInSnapshot } from './media-item-lookup';
import { MediaAssetRecord } from './media-asset.schema';

@Injectable()
export class MediaAssetsService {
  constructor(
    @InjectModel(MediaAssetRecord.name) private readonly model: Model<MediaAssetRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly usersService: UsersService,
    private readonly deliveryRegistry: ExamVideoDeliveryRegistry,
  ) {}

  async listForAttempt(attemptId: string): Promise<ExamMediaDto[]> {
    const map = await this.listForAttempts([attemptId]);
    return map.get(attemptId) ?? [];
  }

  /** Запрос и группировка по попытке — media-asset-list.ts (файл-лимит
   * CLAUDE.md «Храповики»). */
  async listForAttempts(attemptIds: string[]): Promise<Map<string, ExamMediaDto[]>> {
    return listMediaForAttempts(this.model, attemptIds);
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
      telegramType: source.telegramType,
      durationSec: source.durationSec,
      sizeBytes: source.sizeBytes,
      receivedAt: now,
    });
    return { media, examTitle: owner.examTitle };
  }

  /** Запасной путь — ссылка (ADR-0023), владелец из сессии (SECURITY §3):
   * чужой attemptId — тот же отказ, что несуществующий. itemId не
   * video-вопроса снимка (ADR-0037) — здесь есть кому объяснить причину, в
   * отличие от бота. Повторный вызов заменяет прежнюю ссылку (ADR-0086). */
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
    if (itemId !== undefined && !isVideoItemInSnapshot(owner.blocks, itemId)) {
      throw new NotFoundError(EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE);
    }
    // ADR-0086: работу уже проверили — учитель поставил итог, глядя на
    // конкретное видео, молча подменять его новой ссылкой нельзя.
    if (owner.status === 'graded') {
      throw new ConflictError(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE);
    }

    return upsertLinkMediaAsset(this.model, {
      attemptId,
      userId,
      itemId,
      url,
      receivedAt: now,
    });
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

  /** Учитель просит переслать видео себе в бота ещё раз — кнопка на карточке
   * проверки (ADR-0088), не автоматика: переключатель уведомлений тут ни при
   * чём (SECURITY §9). Логика — media-asset-send.ts (файл-лимит). */
  async sendToChat(
    attemptId: string,
    mediaId: string,
    requesterId: string,
  ): Promise<void> {
    await sendMediaToChat(
      {
        model: this.model,
        attemptModel: this.attemptModel,
        usersService: this.usersService,
      },
      this.deliveryRegistry.get(),
      attemptId,
      mediaId,
      requesterId,
    );
  }
}
