// Текст DM учителю про автоматически отменённую рассылку — чистая логика,
// без Mongo и DI (CLAUDE.md «Тесты»): классификация причины (broadcasts/
// broadcast-cancel-reasons.ts) → действие → текст (docs/VOICE.md — что
// случилось и что сделать). Причина без сформулированного действия
// (classifyCancelReason вернул undefined) — DM не шлём вовсе.
import {
  classifyCancelReason,
  type BroadcastCancelAction,
} from '../broadcasts/broadcast-cancel-reasons';

const MESSAGE_BY_ACTION: Record<BroadcastCancelAction, (name: string) => string> = {
  no_channels: (name) =>
    `Ссылка на «${name}» не уйдёт: у занятия нет каналов рассылки. Отметьте каналы в «Расписании».`,
  channels_disabled: (name) =>
    `Ссылка на «${name}» не уйдёт: все каналы класса выключены. Включите канал в «Каналах».`,
  no_link: (name) =>
    `Ссылка на «${name}» не уйдёт: у занятия нет ссылки Zoom. Впишите ссылку в «Расписании».`,
  too_late: (name) =>
    `Ссылка на «${name}» не ушла: занятие уже началось, когда сервис проснулся. ` +
    'Отправьте вручную в «Рассылках».',
};

/** `name` — «{класс} {время}» (тот же формат, что у notifyDeliveryFailed). */
export function cancelledBroadcastMessage(
  reason: string,
  name: string,
): string | undefined {
  const action = classifyCancelReason(reason);
  return action ? MESSAGE_BY_ACTION[action](name) : undefined;
}
