// Объяснение выбора в карточке проверки (ADR-0146) — под списком вариантов:
// подпись «Объяснение ученика» и сам текст, простым абзацем (не RichText —
// это слова ученика, не формулировка учителя, акцентов в них нет и не
// будет). Перенос строк — `white-space: pre-line`: текст хранится как есть,
// без разметки, и должен читаться так, как ученик его написал.
//
// Своим файлом, а не веткой в AttemptReviewQuestion.tsx: тот стоит у самого
// предела храповика размера (CLAUDE.md «Храповики») — тот же приём, что уже
// применён к AttemptReviewQuestionOptions.tsx.
import type { CSSProperties } from 'react';
import type { AttemptReviewQuestionDto } from '@xuanxue/shared';

const REASON_LABEL = 'Объяснение ученика';
// Возможно у попытки, закрытой дедлайном раньше, чем ученик успел дописать
// объяснение (ADR-0146: дедлайн закрывает попытку без исключений).
const NO_REASON_TEXT = 'Объяснения нет.';

const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const labelStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
const textStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.6,
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
};
const metaStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface AttemptReviewQuestionReasonProps {
  question: Pick<AttemptReviewQuestionDto, 'askReason' | 'answerText' | 'answered'>;
}

export function AttemptReviewQuestionReason({
  question,
}: AttemptReviewQuestionReasonProps) {
  const text = question.answerText?.trim();
  if (text) {
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{REASON_LABEL}</span>
        <p style={textStyle}>{question.answerText}</p>
      </div>
    );
  }
  // Вопрос вообще без ответа уже показывает «Ответа нет.»
  // (showNoAnswerMeta, AttemptReviewQuestion.tsx) — вторая плашка о том же
  // здесь была бы дублем.
  if (!question.askReason || !question.answered) return null;
  return <p style={metaStyle}>{NO_REASON_TEXT}</p>;
}
