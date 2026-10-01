// Экран «Уведомления» в личном чате бота (ТЗ notifications-delivery.md §3):
// список видов, доступных человеку по его ролям, с подписью, подсказкой и
// текущим состоянием, плюс кнопка-тумблер на каждый. Общий рендер для команды
// (NotificationsCommandHandler, новое сообщение) и для нажатия кнопки
// (handleNotificationToggle, editMessageText) — CLAUDE.md «Одна механика —
// один компонент»: обе точки показывают один и тот же экран, не две копии.
// «Доступные» — это `availableNotifications(roles)`: дефолт роли
// (shared/src/notifications.ts) плюс виды «по желанию», которые ученик
// включает сам («Запись занятия», ADR-0162) и которые показаны выключенными,
// пока он их не тронул. Всё остальное override не расширяет, а только
// переключает внутри (см. NotificationPrefsService.get).
import {
  availableNotifications,
  NOTIFICATION_HINTS,
  NOTIFICATION_LABELS,
  type NotificationKind,
  type UserRole,
} from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';

const TITLE = 'Уведомления, которые вам доступны:';

export interface NotificationsMenu {
  text: string;
  buttons: InlineKeyboardButton[][];
}

/** `available` никогда не пуст: у каждой роли из `DEFAULT_NOTIFICATIONS_BY_ROLE`
 * (включая дефолт гостя) есть хотя бы один вид — тест-сверка в
 * notifications.spec.ts (shared) не даёт этому инварианту незаметно сломаться. */
export function buildNotificationsMenu(
  roles: UserRole[],
  enabled: readonly NotificationKind[],
): NotificationsMenu {
  const available = availableNotifications(roles);
  const enabledSet = new Set(enabled);
  const lines = available.map((kind) => {
    const state = enabledSet.has(kind) ? 'включено' : 'выключено';
    return `${NOTIFICATION_LABELS[kind]} — ${state}\n${NOTIFICATION_HINTS[kind]}`;
  });
  const buttons = available.map((kind) => [
    inlineButton(toggleButtonLabel(enabledSet.has(kind)), 'notif', kind),
  ]);
  return { text: `${TITLE}\n\n${lines.join('\n\n')}`, buttons };
}

// Название вида уведомления уже стоит над каждой кнопкой (ярлык + подсказка
// в тексте выше) — на самой кнопке оставляем только действие.
function toggleButtonLabel(isEnabled: boolean): string {
  return isEnabled ? 'Выключить' : 'Включить';
}
