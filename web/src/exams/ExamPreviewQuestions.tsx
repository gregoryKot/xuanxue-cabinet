// Список вопросов в предпросмотре «глазами ученика» — по порядку снимка
// формы. Перемешивание показано словами, а не выдуманной перестановкой: у
// каждого сдающего порядок свой, здесь виден один из вариантов.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';

const SHUFFLE_QUESTIONS_NOTE =
  'Порядок вопросов будет другим у каждого сдающего — здесь показан один из вариантов.';
const SHUFFLE_OPTIONS_NOTE =
  'Варианты ответа тоже встанут в другом порядке у каждого сдающего.';
const EMPTY_NOTE = 'В экзамене пока нет вопросов — сдающий увидит пустой экран.';

const noteStyle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface ExamPreviewQuestionsProps {
  itemIds: string[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  bankItems: ExamItemDto[];
}

export function ExamPreviewQuestions({
  itemIds,
  shuffleQuestions,
  shuffleOptions,
  bankItems,
}: ExamPreviewQuestionsProps) {
  return (
    <section>
      {shuffleQuestions && <p style={noteStyle}>{SHUFFLE_QUESTIONS_NOTE}</p>}
      {shuffleOptions && <p style={noteStyle}>{SHUFFLE_OPTIONS_NOTE}</p>}
      {itemIds.length === 0 && <p style={noteStyle}>{EMPTY_NOTE}</p>}
      {itemIds.map((itemId, index) => (
        <ExamPreviewQuestion
          key={itemId}
          index={index}
          item={bankItems.find((candidate) => candidate.id === itemId)}
        />
      ))}
    </section>
  );
}
