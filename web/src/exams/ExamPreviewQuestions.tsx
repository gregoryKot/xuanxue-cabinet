// Список вопросов в предпросмотре «глазами ученика» — по порядку снимка
// формы. Перемешивание показано словами, а не выдуманной перестановкой: у
// каждого сдающего порядок свой, здесь виден один из вариантов. Список лежит
// в карточке, как на экране сдачи (attempt/AttemptInProgress.tsx, направление
// «Тёплая школа», docs/adr/0043) — вопросы внутри карточки по-прежнему
// разделены волосяными линиями строк (.xuanxue-question-row,
// components/QuestionRow.tsx), а не рамкой.
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

// Единственная карточка-поверхность этого экрана — локальный литерал,
// скопированный дословно из attempt/AttemptInProgress.tsx (её же комментарий
// объясняет причину): поверхность объявлена локально в дюжине экранов
// кабинета, сводить их под общий экспорт — рефакторинг отдельным PR (CLAUDE.md
// 1б, серия ADR-0043). Учитель смотрит «глазами ученика» и обязан увидеть тот
// же пиксель, что и он, — не «примерно похожий».
const blockCardStyle: CSSProperties = {
  padding: '20px 22px',
  background: 'var(--card)',
  borderRadius: 'var(--radius-block)',
  boxShadow: 'var(--shadow-card)',
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
    <section style={sectionStyle}>
      {shuffleQuestions && <p style={noteStyle}>{SHUFFLE_QUESTIONS_NOTE}</p>}
      {shuffleOptions && <p style={noteStyle}>{SHUFFLE_OPTIONS_NOTE}</p>}
      {itemIds.length === 0 && <p style={noteStyle}>{EMPTY_NOTE}</p>}
      {itemIds.length > 0 && (
        <div style={blockCardStyle}>
          <ol style={listStyle}>
            {itemIds.map((itemId, index) => (
              <ExamPreviewQuestion
                key={itemId}
                index={index}
                item={bankItems.find((candidate) => candidate.id === itemId)}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
