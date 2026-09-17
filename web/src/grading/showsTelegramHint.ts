// Подсказка «Свяжите Telegram» на «Проверке работ» (ADR-0042). `telegramLinked`
// отвечает на другой вопрос — «бот узнает человека»: у вошедшего через виджет
// Telegram он true сразу, хотя личного чата с ботом ещё нет. Уведомление
// «работу сдали» уходит только при активном личном чате (`botChatActive`),
// поэтому подсказка тоже решает по нему, не по `telegramLinked`.
import { defaultNotifications, type MeDto, type NotificationKind } from '@xuanxue/shared';

// Только этот вид уведомления связан с очередью проверки — общий список
// ролей берём из shared/src/notifications.ts, а не повторяем пару
// «teacher/assistant» здесь: своя копия разъехалась бы с ним на первой же
// правке ролей (CLAUDE.md «Одна механика — один компонент»).
const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';

/** `me === null` — сессия ещё грузится (AuthProvider не ответил): подсказка
 * молчит, а не появляется вспышкой после загрузки. */
export function showsTelegramHint(me: MeDto | null): boolean {
  if (!me) return false;
  return (
    defaultNotifications(me.roles).includes(ATTEMPT_SUBMITTED_KIND) && !me.botChatActive
  );
}
