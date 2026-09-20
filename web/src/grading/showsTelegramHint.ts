// Подсказка «Свяжите Telegram» на «Проверке работ» (ADR-0042, ADR-0066).
// Предлагать ли связку вообще, решает общий предикат showsTelegramOffer(me)
// (признак `botChatActive`, отметка «у меня нет Telegram» — ADR-0067): своя
// копия того же условия здесь разъехалась бы с ним на первой же правке.
// ADR-0066 прямо этого требует — новое место, где кабинет предлагает связку,
// спрашивает showsTelegramOffer(me), а не собственное условие по `me`. Эта
// подсказка сужает общий вопрос ролью: она нужна только тому, кто вообще
// видит очередь проверки (виду уведомления `attempt_submitted`).
import { defaultNotifications, type MeDto, type NotificationKind } from '@xuanxue/shared';
import { showsTelegramOffer } from '../telegram/showsTelegramOffer';

// Только этот вид уведомления связан с очередью проверки — общий список
// ролей берём из shared/src/notifications.ts, а не повторяем пару
// «teacher/assistant» здесь: своя копия разъехалась бы с ним на первой же
// правке ролей (CLAUDE.md «Одна механика — один компонент»).
const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';

/** `me === null` — сессия ещё грузится (AuthProvider не ответил): подсказка
 * молчит, а не появляется вспышкой после загрузки. Проверка нужна и здесь
 * отдельно: `me.roles` ниже читается раньше, чем вызывается
 * showsTelegramOffer(me), и без неё tsc не пропустит это чтение
 * (strictNullChecks), хотя сам showsTelegramOffer на null тоже отвечает
 * false. */
export function showsTelegramHint(me: MeDto | null): boolean {
  if (!me) return false;
  return (
    defaultNotifications(me.roles).includes(ATTEMPT_SUBMITTED_KIND) &&
    showsTelegramOffer(me)
  );
}
