// Раздел «Ваши ответы» на экране «Отправлено» — ученик возвращается сюда
// перечитать, что он написал и отметил, уже без права что-либо менять (отзыв
// владельца 2026-09-22, docs/adr/0123). Поля выключены тем же приёмом, что у
// предпросмотра учителя «глазами ученика» (exams/ExamPreviewQuestion.tsx):
// сдача завершена, форма ответа больше не форма, а протокол уже сделанного.
//
// Вопрос рисуется общими компонентами сдачи — QuestionRow.tsx (строка,
// номер, формулировка) и AttemptAnswerFields.tsx (поле ответа по типу,
// выключенное) — тот же облик, что видел ученик при сдаче, без второй
// реализации того же вопроса (CLAUDE.md «Одна механика — один компонент»).
//
// Подсказка ученику и критерии проверки убраны из вопроса вместе с полями
// (ADR-0128) — их здесь никогда и не было.
//
// Видео-вопрос сюда не попадает — см. комментарий-шапку
// attemptSubmittedBlocks.ts; его место — блок «Видео» ниже
// (AttemptSubmittedVideos.tsx).
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { blockCardStyle, dividedListStyle } from '../components/listCardStyles';
import { QuestionRow } from '../components/QuestionRow';
import { AttemptAnswerFields } from './AttemptAnswerFields';
import { attemptSectionHeadingStyle, attemptSectionStyle } from './attemptLayout';
import { collectSubmittedBlocks } from './attemptSubmittedBlocks';

const SECTION_TITLE = 'Ваши ответы';
const NOTE_TEXT = 'Работа отправлена, ответы менять уже нельзя.';

const titleStyle: CSSProperties = { display: 'block', paddingBottom: 6 };
const noteStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface AttemptSubmittedAnswersProps {
  attempt: ExamAttemptDto;
}

export function AttemptSubmittedAnswers({ attempt }: AttemptSubmittedAnswersProps) {
  const blocks = collectSubmittedBlocks(attempt);
  if (blocks.length === 0) return null;

  return (
    <section style={attemptSectionStyle}>
      <h2 style={attemptSectionHeadingStyle}>{SECTION_TITLE}</h2>
      <p style={noteStyle}>{NOTE_TEXT}</p>
      <div style={blockCardStyle}>
        {blocks.map((block) => (
          <section key={block.id}>
            {block.title && (
              <span className="xuanxue-eyebrow" style={titleStyle}>
                {block.title}
              </span>
            )}
            <ol style={dividedListStyle}>
              {block.questions.map(({ question, index, answer }) => (
                <QuestionRow
                  key={question.itemId}
                  index={index}
                  promptId={`attempt-answer-${question.itemId}`}
                  prompt={question.prompt}
                >
                  <AttemptAnswerFields
                    labelledBy={`attempt-answer-${question.itemId}`}
                    itemId={question.itemId}
                    kind={question.kind}
                    options={question.options}
                    text={answer?.text}
                    selected={answer?.optionIds}
                  />
                </QuestionRow>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}
