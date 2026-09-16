// Один блок попытки (ТЗ п.2) — заголовок из снимка формы, вопросы строго в
// порядке снимка (перемешивание вопросов и вариантов уже применено при старте
// попытки, ExamAttemptsService.start — здесь порядок только рисуем).
//
// Заголовок — растяжка-рубрика (`.xuanxue-eyebrow`, index.css), как в разборе
// попытки у учителя (grading/AttemptReviewBlock.tsx): служебная пометка
// «откуда блок», а не второй заголовок рядом с названием экзамена. Своей
// рамки у блока нет — вопросы разделены волосяными линиями строк
// (`.xuanxue-question-row`), и рамка поверх них дала бы двойную черту.
import type { CSSProperties } from 'react';
import type { AttemptBlockDto } from '@xuanxue/shared';
import type { UseAttemptAutosaveResult } from './useAttemptAutosave';
import { AttemptQuestion } from './AttemptQuestion';

const titleStyle: CSSProperties = { display: 'block', paddingBottom: 6 };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };

interface AttemptBlockProps {
  block: AttemptBlockDto;
  autosave: UseAttemptAutosaveResult;
}

export function AttemptBlock({ block, autosave }: AttemptBlockProps) {
  return (
    <section>
      {block.title && (
        <span className="xuanxue-eyebrow" style={titleStyle}>
          {block.title}
        </span>
      )}
      <ol style={listStyle}>
        {block.questions.map((question, index) => (
          <AttemptQuestion
            key={question.itemId}
            index={index}
            question={question}
            autosave={autosave}
          />
        ))}
      </ol>
    </section>
  );
}
