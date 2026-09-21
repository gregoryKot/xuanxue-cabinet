// Строка списка проверки — имя ученика, экзамен, когда сдана, пометка
// «Сдано по времени» (ТЗ 4.6, п.1: `expired` — сдано не человеком, а
// дедлайном); у проверенной работы (раздел «Проверенные», docs/PLAN.md
// §4.6) — ещё итог и когда проверено. Список теперь одна карточка (обёртка —
// GradingQueueScreen.tsx): строки, каждая со своим фоном, радиусом и тенью,
// стояли вплотную и давали швы и зазубренные углы (отзыв владельца по
// снимку «Вопросов», где было то же самое, docs/adr/0043). Строка несёт
// только паддинг и волосяную линию снизу, у последней (`isLast`) линии нет —
// тот же приём, что у exams/ExamCard.tsx и exam-items/ExamItemCard.tsx.
import { DELETED_USER_NAME, type ExamAttemptDto } from '@xuanxue/shared';
import type { CSSProperties } from 'react';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { formatDateTime } from '../lib/formatDate';
import { GRADING_OUTCOME_LABELS_RU } from './gradingFormInput';

// `<button>` приносит свою рамку и фон — без явного сброса строка выглядела
// бы обведённой поверх общей карточки списка (тот же баг, что и до ADR-0031,
// components/listCardStyles.ts).
const rowButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  padding: '16px 20px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

// «Сдал» — нефрит: единственный смысл, за которым этот цвет закреплён
// (docs/adr/0031, правило одного акцента — терракота на этом экране не
// используется). Остальные итоги остаются тушью, тот же приём, что
// student/ExamAttemptOutcome.tsx и notifications/NotificationRow.tsx.
const outcomeRowStyle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: 14,
  color: 'var(--ink)',
};
const passedOutcomeRowStyle: CSSProperties = { ...outcomeRowStyle, color: 'var(--jade)' };

interface GradingQueueCardProps {
  attempt: ExamAttemptDto;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (GradingQueueScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function GradingQueueCard({
  attempt,
  onSelect,
  isLast = false,
}: GradingQueueCardProps) {
  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <button type="button" style={rowButtonStyle} onClick={onSelect}>
        <div style={listCardTitleStyle}>{attempt.userName ?? DELETED_USER_NAME}</div>
        {attempt.outcome && (
          <div
            style={attempt.outcome === 'passed' ? passedOutcomeRowStyle : outcomeRowStyle}
          >
            {GRADING_OUTCOME_LABELS_RU[attempt.outcome]}
          </div>
        )}
        <div style={listCardMetaStyle}>
          {attempt.examTitle}
          {attempt.submittedAt && ` · сдано ${formatDateTime(attempt.submittedAt)}`}
          {attempt.expired && ' · сдано по времени'}
          {attempt.gradedAt && ` · проверено ${formatDateTime(attempt.gradedAt)}`}
        </div>
      </button>
    </li>
  );
}
