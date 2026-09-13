// Итог проверенной попытки на карточке ученика (ТЗ п.1, слой 4.7): что
// зачтено, баллы по критериям, комментарий учителя. Отдельный компонент,
// чтобы StudentExamCard.tsx не раздувался (CLAUDE.md «Храповики», лимит
// 150 строк) — и чтобы у этого куска был свой понятный набор пропсов вместо
// целого MyExamAttemptSummaryDto с необязательными полями.
import type { CSSProperties } from 'react';
import type { GradingCriterionDto, GradingOutcome } from '@xuanxue/shared';
import { listCardMetaStyle } from '../components/listCardStyles';
import { describeOutcome, formatCriterionScore } from './examAttemptState';

const outcomeStyle: CSSProperties = { margin: 0, fontWeight: 600, fontSize: 14 };
const criteriaListStyle: CSSProperties = {
  margin: '4px 0 0',
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const commentStyle: CSSProperties = { ...listCardMetaStyle, margin: '6px 0 0' };

interface ExamAttemptOutcomeProps {
  outcome: GradingOutcome;
  /** Критерии своей же попытки (снимок оценки), не критерии вопроса —
   * их этому экрану API и не отдаёт (shared/src/my-exams.ts). */
  criteria?: GradingCriterionDto[];
  comment?: string;
}

export function ExamAttemptOutcome({
  outcome,
  criteria,
  comment,
}: ExamAttemptOutcomeProps) {
  return (
    <div>
      <p style={outcomeStyle}>{describeOutcome(outcome)}</p>

      {criteria && criteria.length > 0 && (
        <ul style={criteriaListStyle}>
          {criteria.map((criterion) => (
            <li key={criterion.id} style={listCardMetaStyle}>
              {formatCriterionScore(criterion)}
              {criterion.comment && <> — {criterion.comment}</>}
            </li>
          ))}
        </ul>
      )}

      {comment && (
        <p style={commentStyle}>
          <strong>Комментарий учителя: </strong>
          {comment}
        </p>
      )}
    </div>
  );
}
