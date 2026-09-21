// Действия по кнопкам бота (предпросмотр, «Запись?», ручные каналы) —
// вынесены из callback-query.handler.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»): маршрутизация и проверка доступа остаются в хендлере, здесь —
// что делает каждое действие.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { NotificationKind } from '@xuanxue/shared';
import type { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { ConflictError, NotFoundError } from '../../common/errors';
import type { DeliveriesService } from '../../deliveries/deliveries.service';
import type { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import type { BotSessionService } from '../bot-session.service';
import type { BotUserAccessService } from '../bot-user-access.service';
import { buildNotificationsMenu } from './notifications-menu';

// Экспортирована — callback-query.handler.ts зовёт её же в своём catch, не
// повторяет литерал (CLAUDE.md «Одна механика — один компонент»).
export const GENERIC_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';

/** Ошибка домена (рассылка уже отправлена/отменена, доставка не найдена) —
 * текст уже готов по VOICE (broadcast-journal.queries.ts/deliveries.service.ts),
 * его и показываем; неизвестная ошибка — общий текст, не исключение наружу. */
function userFacingError(err: unknown): string {
  return err instanceof NotFoundError || err instanceof ConflictError
    ? err.message
    : GENERIC_ERROR;
}

export async function handleCancel(
  ctx: Context,
  broadcasts: BroadcastsService,
  broadcastId: string,
): Promise<void> {
  try {
    await broadcasts.cancel(broadcastId);
    await ctx.editMessageText('Отменено. Ссылка не уйдёт.').catch(() => null);
  } catch (err) {
    await ctx.editMessageText(userFacingError(err)).catch(() => null);
  }
}

export async function handleTopicButton(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  lessonId: string,
  now: DateTime,
): Promise<void> {
  await botSessions.startTopicWait(chatId, lessonId, now);
  await ctx.editMessageText('Напишите тему одним сообщением.').catch(() => null);
}

/** «Записи не будет» под «Запись?» — recordingPromptedAt уже стоит (ставится
 * до отправки самого вопроса, RecordingPromptService), повторно спрашивать
 * не будет и без этой кнопки; она только закрывает ожидание источника записи
 * в этом чате, чтобы случайное следующее сообщение не приняли за запись.
 * `clearIfLesson`, не `clear` — учитель мог получить второй вопрос «Запись?»
 * по другому занятию раньше, чем ответил на первый: «Записи не будет» под
 * первым не должно погасить ожидание второго. */
export async function handleNoRecording(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  lessonId: string,
): Promise<void> {
  await botSessions.clearIfLesson(chatId, lessonId);
  await ctx.editMessageText('Хорошо, записи не будет.').catch(() => null);
}

export async function handleSent(
  ctx: Context,
  deliveries: DeliveriesService,
  deliveryId: string,
  now: DateTime,
): Promise<void> {
  try {
    await deliveries.markSent(deliveryId, now);
    await ctx.editMessageText('Отмечено: отправлено.').catch(() => null);
  } catch (err) {
    await ctx.editMessageText(userFacingError(err)).catch(() => null);
  }
}

/** Кнопка-тумблер экрана «Уведомления» (ТЗ notifications-delivery.md §3):
 * доступ — BotUserAccessService, та же точка, что у кнопок экзамена
 * (exam-callback-router.ts) и «Экзамены»/«В меню» (open-menu-screen.ts) —
 * своими уведомлениями управляет любой вошедший, включая ученика (отзыв
 * владельца 2026-09-19, ADR-0065): unknown молчит, denied отвечает
 * ACCESS_MESSAGE (CLAUDE.md «тихий отказ — самая дорогая ошибка»). */
export async function handleNotificationToggle(
  ctx: Context,
  botAccess: BotUserAccessService,
  notificationPrefs: NotificationPrefsService,
  chatId: number,
  kind: NotificationKind,
): Promise<void> {
  const access = await botAccess.resolve(chatId);
  if (access.kind === 'unknown') return;
  if (access.kind === 'denied') {
    await ctx.editMessageText(access.message).catch(() => null);
    return;
  }
  const { user } = access;

  const current = await notificationPrefs.get(user.id, user.roles);
  await notificationPrefs.set(user.id, kind, !current.enabled.includes(kind));
  const updated = await notificationPrefs.get(user.id, user.roles);

  const menu = buildNotificationsMenu(user.roles, updated.enabled);
  await ctx
    .editMessageText(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
    .catch(() => null);
}
