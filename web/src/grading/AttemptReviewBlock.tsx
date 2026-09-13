// Блок вопросов карточки проверки (ТЗ 4.6, п.3) — заголовок блока и его
// вопросы по порядку снимка попытки.
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { AttemptReviewQuestion } from './AttemptReviewQuestion';

interface AttemptReviewBlockProps {
  block: AttemptReviewBlockDto;
}

export function AttemptReviewBlock({ block }: AttemptReviewBlockProps) {
  return (
    <section>
      {block.title && <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{block.title}</h3>}
      {block.questions.map((question, index) => (
        <AttemptReviewQuestion key={question.itemId} index={index} question={question} />
      ))}
    </section>
  );
}
