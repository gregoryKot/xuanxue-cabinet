// Лента кабинета (`/me/inbox`, слой in-app уведомлений, ADR-0061) — читает и
// отмечает то, что записал InAppExamNotifier. userId — только из сессии
// (InboxController), владелец из пути не берём нигде (SECURITY §3): `id` в
// markRead — просто строка, не признак доступа.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  INBOX_ITEM_NOT_FOUND_MESSAGE,
  LIST_LIMIT_DEFAULT,
  type InboxPageDto,
  type ListInboxQuery,
  type NotificationDto,
} from '@xuanxue/shared';
import { assertObjectId } from '../common/object-id';
import { NotFoundError } from '../common/errors';
import { toNotificationDto, type RawLeanNotification } from './notification.mapper';
import { NotificationRecord } from './notification.schema';

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly model: Model<NotificationRecord>,
  ) {}

  /** Недавно переоценённые сверху (updatedAt, не createdAt — комментарий у
   * индекса в notification.schema.ts): строка «всплывает», когда учитель
   * переставил итог. unreadCount — отдельным count по всей ленте человека,
   * не по одной странице лимита (бейдж колокольчика не должен занижать
   * счётчик). Оба запроса фильтруют `dismissedAt: null` — убранное (dismiss,
   * отзыв владельца 2026-09-22) не показывается в ленте и не считается
   * бейджем колокольчика: иначе цифра висела бы над тем, чего в ленте нет. */
  async list(userId: string, query: ListInboxQuery): Promise<InboxPageDto> {
    const [docs, unreadCount] = await Promise.all([
      this.model
        .find({ userId, dismissedAt: null })
        .sort({ updatedAt: -1 })
        .limit(query.limit ?? LIST_LIMIT_DEFAULT)
        .lean<RawLeanNotification[]>(),
      this.model.countDocuments({ userId, readAt: null, dismissedAt: null }),
    ]);
    return { items: docs.map(toNotificationDto), unreadCount };
  }

  /** Чужой `id` (или несуществующий) — `NotFoundError`, не 403: не
   * подтверждаем даже факт существования чужой строки (тот же приём, что
   * ExamAttemptsService.loadOwn). Повторная отметка — не ошибка: время
   * отметки просто обновляется, действие идемпотентно по наблюдаемому
   * результату («прочитано»). */
  async markRead(userId: string, id: string, now: DateTime): Promise<NotificationDto> {
    assertObjectId(id, INBOX_ITEM_NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, userId },
        { $set: { readAt: now.toJSDate() } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanNotification | null>();
    if (!doc) throw new NotFoundError(INBOX_ITEM_NOT_FOUND_MESSAGE);
    return toNotificationDto(doc);
  }

  /** Убрать строку из ленты (отзыв владельца 2026-09-22: «уведомление нельзя
   * смахнуть, удалить») — мягко, полем `dismissedAt`, не удалением документа
   * (причина — комментарий у поля в notification.schema.ts). Тот же приём
   * владения, что markRead: чужой или несуществующий `id` — `NotFoundError`,
   * не 403 (не подтверждаем существование чужой строки). Повторный вызов —
   * не ошибка: время убирания просто перезаписывается, идемпотентно по
   * наблюдаемому результату («убрано»). */
  async dismiss(userId: string, id: string, now: DateTime): Promise<NotificationDto> {
    assertObjectId(id, INBOX_ITEM_NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, userId },
        { $set: { dismissedAt: now.toJSDate() } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanNotification | null>();
    if (!doc) throw new NotFoundError(INBOX_ITEM_NOT_FOUND_MESSAGE);
    return toNotificationDto(doc);
  }

  /** Только свои непрочитанные — второй клик или повтор сети не ошибка,
   * updateMany на пустом множестве просто ничего не меняет. */
  async markAllRead(userId: string, now: DateTime): Promise<void> {
    await this.model.updateMany(
      { userId, readAt: null },
      { $set: { readAt: now.toJSDate() } },
    );
  }
}
