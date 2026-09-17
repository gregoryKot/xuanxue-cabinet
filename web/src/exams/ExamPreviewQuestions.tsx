// Список вопросов в предпросмотре «глазами ученика» — по порядку снимка
// формы. Перемешивание показано словами, а не выдуманной перестановкой: у
// каждого сдающего порядок свой, здесь виден один из вариантов. Строки
// вопросов — нумерованный список без рамки, как на экране сдачи
// (attempt/AttemptBlock.tsx): вопросы разделены волосяными линиями строк.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { noteStyle } from '../components/screenLayout';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';

const SHUFFLE_QUESTIONS_NOTE =
  'Порядок вопросов будет другим у каждого сдающего — здесь показан один из вариантов.';
const SHUFFLE_OPTIONS_NOTE =
  'Варианты ответа тоже встанут в другом порядке у каждого сдающего.';
const EMPTY_NOTE = 'В экзамене пока нет вопросов — сдающий увидит пустой экран.';

// Заметки о перемешивании и сам список — колонкой с зазором: у общего
// noteStyle отступов нет, и две заметки подряд слипались бы в один абзац.
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };

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
    <section style={sectionStyle}>
      {shuffleQuestions && <p style={noteStyle}>{SHUFFLE_QUESTIONS_NOTE}</p>}
      {shuffleOptions && <p style={noteStyle}>{SHUFFLE_OPTIONS_NOTE}</p>}
      {itemIds.length === 0 && <p style={noteStyle}>{EMPTY_NOTE}</p>}
      <ol style={listStyle}>
        {itemIds.map((itemId, index) => (
          <ExamPreviewQuestion
            key={itemId}
            index={index}
            item={bankItems.find((candidate) => candidate.id === itemId)}
          />
        ))}
      </ol>
    </section>
  );
}
