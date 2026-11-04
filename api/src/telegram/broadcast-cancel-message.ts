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
  no_group: (name) =>
    `Ссылка на «${name}» не уйдёт: у занятия нет группы. Выберите группу на странице занятия.`,
  group_without_channel: (name) =>
    `Ссылка на «${name}» не уйдёт: у группы занятия нет канала. Выберите эту группу у канала в «Каналах».`,
  no_link: (name) =>
    `Ссылка на «${name}» не уйдёт: у занятия нет ссылки Zoom. Впишите ссылку в «Расписании».`,
  too_late: (name) =>
    `Ссылка на «${name}» не ушла: занятие уже началось, когда сервис проснулся. ` +
    'Отправьте вручную: «Расписание и рассылки» → «Журнал отправок».',
};

/** `name` — «{класс} {время}» (тот же формат, что у notifyDeliveryFailed). */
export function cancelledBroadcastMessage(
  reason: string,
  name: string,
): string | undefined {
  const action = classifyCancelReason(reason);
  return action ? MESSAGE_BY_ACTION[action](name) : undefined;
}
