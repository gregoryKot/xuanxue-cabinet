// Текст и цвет статуса рассылки-ссылки занятия — общий для карточки
// «Сегодня» (TodayLessonCard.tsx) и строки дня (LessonCard.tsx): один
// цветовой закон на оба места, а не два независимых (CLAUDE.md «Одна
// механика — один компонент», раньше жил только в LessonCard.tsx).
//
// Цвет — правило макета «Занятия» (docs/adr/0043, 1c-planning.html): ушла —
// нефрит, ждёт/отменена — тушь тусклая, ошибка — красный. Тот же закон уже
// применён к рассылкам в журнале (broadcasts/broadcastLabels.ts,
// BROADCAST_STATUS_COLOR) — здесь не импортируем его напрямую: текст
// («Ссылка ушла» вместо «Отправлено») свой для этого места, и связывать два
// независимых экрана общим файлом ради совпавшего цвета — лишняя связка не по
// требованию задачи.
import type { BroadcastStatus } from '@xuanxue/shared';

export const LESSON_BROADCAST_TEXT: Record<BroadcastStatus, string> = {
  scheduled: 'Ссылка ждёт отправки',
  sent: 'Ссылка ушла',
  failed: 'Ошибка отправки',
  cancelled: 'Отменена',
};

export const LESSON_BROADCAST_COLOR: Record<BroadcastStatus, string> = {
  scheduled: 'var(--ink-soft)',
  sent: 'var(--jade)',
  failed: 'var(--danger)',
  cancelled: 'var(--ink-soft)',
};
