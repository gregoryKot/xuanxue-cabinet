// Строка ленты кабинета — собирается здесь, на чтении, а не хранится готовой
// в записи (причина — шапка notification.schema.ts). Одно место, где рождается
// формулировка для колокольчика: клиент показывает `text` как есть и своих
// заготовок не держит.
//
// Тексты — константами в исходниках, не в базе: иначе их не увидит
// `scripts/check-robot-phrases.mjs` (он ходит по `api/src`, `web/src`,
// `shared/src`). Итог проверки сюда НЕ попадает намеренно — он едет в DTO
// отдельным полем `outcome`, и лента рисует его своей подписью
// (web/src/student/ExamAttemptOutcome.tsx); дублировать его словами значило бы
// сказать одно и то же дважды в одной строке.
import { NOTIFICATION_LABELS, type NotificationKind } from '@xuanxue/shared';

/** Виды, у которых своя формулировка события. Остальные (в ленту сейчас не
 * пишутся — `post_draft`, `delivery_failed` и прочие штатные) честно падают
 * на общее название вида из `NOTIFICATION_LABELS`: лучше сухо, чем пусто. */
const EVENT_TEXT: Partial<Record<NotificationKind, string>> = {
  exam_result: 'Работу проверили',
  attempt_submitted: 'Работу прислали на проверку',
};

const TITLE_SEPARATOR = ' — ';

interface NotificationTextInput {
  kind: NotificationKind;
  examTitle?: string;
}

/** Без названия формы строка остаётся осмысленной: форму могли удалить, а
 * будущие виды уведомления к форме и не привязаны. Пустое название (пробелы)
 * — то же самое, что его отсутствие: разделитель без второй половины выглядел
 * бы обрывом. */
export function notificationText({ kind, examTitle }: NotificationTextInput): string {
  const event = EVENT_TEXT[kind] ?? NOTIFICATION_LABELS[kind];
  const title = examTitle?.trim();
  if (!title) return event;
  return `${event}${TITLE_SEPARATOR}${title}`;
}
