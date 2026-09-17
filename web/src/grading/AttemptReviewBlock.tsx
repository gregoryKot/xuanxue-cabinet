// Блок вопросов карточки проверки (ТЗ 4.6, п.3) — заголовок блока и его
// вопросы по порядку снимка попытки. Заголовок — растяжка-рубрика
// (`.xuanxue-eyebrow`, index.css), не отдельный уровень антиквы: в списке
// вопросов он служебная пометка «откуда блок», а не второй заголовок экрана
// рядом с «Ответы» (AttemptReviewAnswers.tsx).
import type { CSSProperties } from 'react';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { AttemptReviewQuestion } from './AttemptReviewQuestion';
import type { AttemptReviewVideoControls } from './useAttemptReview';

const titleStyle: CSSProperties = { display: 'block', padding: '14px 4px 0' };

interface AttemptReviewBlockProps {
  block: AttemptReviewBlockDto;
  video: AttemptReviewVideoControls;
}

export function AttemptReviewBlock({ block, video }: AttemptReviewBlockProps) {
  return (
    <section>
      {block.title && (
        <span className="xuanxue-eyebrow" style={titleStyle}>
          {block.title}
        </span>
      )}
      {block.questions.map((question, index) => (
        <AttemptReviewQuestion
          key={question.itemId}
          index={index}
          question={question}
          video={video}
        />
      ))}
    </section>
  );
}
