// Итог проверенной попытки на карточке ученика (ТЗ п.1, слой 4.7): что
// зачтено и комментарий учителя. Отдельный компонент, чтобы
// StudentExamCard.tsx не раздувался (CLAUDE.md «Храповики», лимит 150 строк)
// — и чтобы у этого куска был свой понятный набор пропсов вместо целого
// MyExamAttemptSummaryDto с необязательными полями.
import type { CSSProperties } from 'react';
import type { GradingOutcome } from '@xuanxue/shared';
import { describeOutcome } from './examAttemptState';

// «Экзамен сдан» — нефрит: единственный смысл, за которым этот цвет
// закреплён (docs/adr/0031). Остальные итоги остаются тушью: «не сдан» и
// «нужно доработать» — не авария, разбор рядом объясняет, что делать.
const PASSED_COLOR = 'var(--jade)';

const outcomeStyle: CSSProperties = { margin: 0, color: 'var(--ink)' };
const passedStyle: CSSProperties = { ...outcomeStyle, color: PASSED_COLOR };
// Комментарий учителя — на подложке, как выписка на полях (макет
// Student.dc.html): он единственный здесь написан живым человеком.
const commentBoxStyle: CSSProperties = {
  margin: '10px 0 0',
  padding: '14px 16px',
  background: 'var(--panel)',
  borderRadius: 3,
  lineHeight: 1.65,
};

interface ExamAttemptOutcomeProps {
  outcome: GradingOutcome;
  comment?: string;
}

export function ExamAttemptOutcome({ outcome, comment }: ExamAttemptOutcomeProps) {
  return (
    <div>
      <p
        className="xuanxue-status-label"
        style={outcome === 'passed' ? passedStyle : outcomeStyle}
      >
        {describeOutcome(outcome)}
      </p>

      {comment && <p style={commentBoxStyle}>{comment}</p>}
    </div>
  );
}
