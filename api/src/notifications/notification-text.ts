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
  lesson_soon: 'Скоро занятие',
  // Дата и время занятия в строку не вставляются: сервер не знает пояса
  // устройства, их дописывают web и push-worker по часам зрителя (ADR-0162).
  lesson_cancelled: 'Занятие отменено',
  payment_due: 'Напоминание об оплате',
  // Строка-страховка бухгалтеру, когда снимок не дошёл до него в Telegram
  // (ADR-0156): формулировка про действие, а не про сбой доставки.
  payments: 'Снимок перевода ждёт подтверждения',
};

const TITLE_SEPARATOR = ' — ';

interface NotificationTextInput {
  kind: NotificationKind;
  /** Название формы (exam_result/attempt_submitted), класса (lesson_soon,
   * lesson_cancelled, recording_ready), материала (material_new) или месяца
   * (payment_due, payments) — ровно одно из четырёх приходит на вид, но
   * склеивание со строкой ниже одинаково для всех: второй заголовок в отдельном
   * поле развёл бы логику показа на два похожих места (CLAUDE.md «Одна механика
   * — один компонент»). */
  title?: string;
}

/** Без названия строка остаётся осмысленной: форму или занятие могли
 * удалить, а будущие виды уведомления вовсе не привязаны к названию. Пустое
 * название (пробелы) — то же самое, что его отсутствие: разделитель без
 * второй половины выглядел бы обрывом. */
export function notificationText({ kind, title }: NotificationTextInput): string {
  const event = EVENT_TEXT[kind] ?? NOTIFICATION_LABELS[kind];
  const trimmed = title?.trim();
  if (!trimmed) return event;
  return `${event}${TITLE_SEPARATOR}${trimmed}`;
}
