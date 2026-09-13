// Один вопрос карточки проверки (ТЗ 4.6, п.3) — формулировка, критерии
// проверки (только учителю — API их не отдаёт ученику ни на одном маршруте,
// exam-grading.ts), ответ ученика, варианты с пометкой верных и выбранных,
// счётчик автопроверки.
import type { CSSProperties } from 'react';
import type { AttemptReviewQuestionDto } from '@xuanxue/shared';
import { formatOptionsCheckSummary } from './optionsCheckSummary';

const NO_ANSWER_TEXT = 'Ответ не дан.';

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 0',
  borderTop: '1px solid var(--border)',
};
const criteriaStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const optionsListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

interface AttemptReviewQuestionProps {
  index: number;
  question: AttemptReviewQuestionDto;
}

export function AttemptReviewQuestion({ index, question }: AttemptReviewQuestionProps) {
  const hasOptions = question.options.length > 0;

  return (
    <div style={wrapperStyle}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        {index + 1}. {question.prompt}
      </p>
      {question.hint && <p style={criteriaStyle}>Подсказка ученику: {question.hint}</p>}
      {question.criteria && (
        <p style={criteriaStyle}>Критерии проверки: {question.criteria}</p>
      )}

      {hasOptions ? (
        <ul style={optionsListStyle}>
          {question.options.map((option) => (
            <li key={option.id}>
              {option.text}
              {option.correct && <strong> — верный</strong>}
              {option.selected && <em> · выбрал ученик</em>}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0 }}>
          {question.answerText?.trim() ? question.answerText : NO_ANSWER_TEXT}
        </p>
      )}

      {question.optionsCheck && (
        <p style={criteriaStyle}>{formatOptionsCheckSummary(question.optionsCheck)}</p>
      )}
    </div>
  );
}
