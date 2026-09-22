// Один блок попытки (ТЗ п.2) — заголовок из снимка формы, вопросы строго в
// порядке снимка (перемешивание вопросов и вариантов уже применено при старте
// попытки, ExamAttemptsService.start — здесь порядок только рисуем).
//
// Заголовок — растяжка-рубрика (`.xuanxue-eyebrow`, index.css), как в разборе
// попытки у учителя (grading/AttemptReviewBlock.tsx): служебная пометка
// «откуда блок», а не второй заголовок рядом с названием экзамена. Своей
// рамки у блока по-прежнему нет — карточка (ADR-0043) оборачивает список
// блоков снаружи, в AttemptInProgress.tsx, а волосяные линии строк
// (`.xuanxue-question-row`) остаются внутренним ритмом карточки. Довод
// «рамка поверх линий даст двойную черту» практикой опровергнут:
// grading/AttemptReviewQuestion.tsx кладёт те же линии внутрь белой
// карточки, и двойной черты нет — тень карточки читается отдельно от
// внутренней линейки.
import type { CSSProperties } from 'react';
import type { AttemptBlockDto } from '@xuanxue/shared';
import { dividedListStyle } from '../components/listCardStyles';
import type { AttemptVideoControls } from './useAttemptMedia';
import type { UseAttemptAutosaveResult } from './useAttemptAutosave';
import { AttemptQuestion } from './AttemptQuestion';

const titleStyle: CSSProperties = { display: 'block', paddingBottom: 6 };

interface AttemptBlockProps {
  block: AttemptBlockDto;
  /** itemId вопросов, подсвеченных как оставшиеся без ответа — пусто, пока
   * ученик не нажал «Отправить» (AttemptInProgress.tsx). */
  unanswered: ReadonlySet<string>;
  autosave: UseAttemptAutosaveResult;
  video: AttemptVideoControls;
}

export function AttemptBlock({ block, unanswered, autosave, video }: AttemptBlockProps) {
  return (
    <section>
      {block.title && (
        <span className="xuanxue-eyebrow" style={titleStyle}>
          {block.title}
        </span>
      )}
      <ol style={dividedListStyle}>
        {block.questions.map((question, index) => (
          <AttemptQuestion
            key={question.itemId}
            index={index}
            question={question}
            unanswered={unanswered.has(question.itemId)}
            autosave={autosave}
            video={video}
          />
        ))}
      </ol>
    </section>
  );
}
