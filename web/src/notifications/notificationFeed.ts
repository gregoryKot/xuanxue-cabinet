// Рубрики и подписи времени центра уведомлений (ADR-0065) — чистая логика
// без DOM и без сети, юнит-тест на все ветки (CLAUDE.md «Тесты»). Дата и
// время самой строки уже пришли с сервера в UTC (in-app-notifications.ts);
// здесь только взгляд на них в поясе читателя, тем же приёмом, что у
// lib/relativeDay.ts.
import type { NotificationDto } from '@xuanxue/shared';
import { formatDateTime, formatTime } from '../lib/formatDate';
import { isToday } from '../lib/relativeDay';

export interface NotificationGroups {
  today: NotificationDto[];
  earlier: NotificationDto[];
}

/** Рубрики «Сегодня» / «Раньше» в поясе читателя — порядок внутри каждой
 * группы остаётся таким, как пришёл (сервер отдаёт свежие первыми), эта
 * функция только раскладывает по двум спискам, не пересортировывает. */
export function groupByDay(
  items: NotificationDto[],
  nowIso: string,
  timeZone?: string,
): NotificationGroups {
  const today: NotificationDto[] = [];
  const earlier: NotificationDto[] = [];
  for (const item of items) {
    const group = isToday(item.createdAt, nowIso, timeZone) ? today : earlier;
    group.push(item);
  }
  return { today, earlier };
}

/** Сегодняшняя строка — просто «19:04», дата и так ясна из рубрики; вчера и
 * старше — дата рядом (formatDateTime), иначе строка вне «Сегодня» не
 * говорит, какой это день. */
export function notificationTimeText(
  iso: string,
  nowIso: string,
  timeZone?: string,
): string {
  return isToday(iso, nowIso, timeZone)
    ? formatTime(iso, timeZone)
    : formatDateTime(iso, timeZone);
}

/** Непрочитана — у строки нет `readAt` (shared/src/inbox.ts). Своей функции
 * «сколько непрочитанных» здесь нет нарочно: их считает сервер по всей ленте
 * (`InboxPageDto.unreadCount`), а не эта страница — счёт по загруженным
 * пятидесяти занижал бы цифру на значке у того, у кого непрочитанных больше. */
export function isUnread(item: NotificationDto): boolean {
  return item.readAt === undefined;
}
