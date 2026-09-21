// Список вопросов в предпросмотре «глазами ученика» — по порядку снимка
// формы. Перемешивание показано словами, а не выдуманной перестановкой: у
// каждого сдающего порядок свой, здесь виден один из вариантов. Список лежит
// в карточке, как на экране сдачи (attempt/AttemptInProgress.tsx, направление
// «Тёплая школа», docs/adr/0043) — вопросы внутри карточки по-прежнему
// разделены волосяными линиями строк (.xuanxue-question-row,
// components/QuestionRow.tsx), а не рамкой.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { blockCardStyle, dividedListStyle } from '../components/listCardStyles';
import { noteStyle } from '../components/screenLayout';
import { questionsPerAttemptNote } from './questionsPerAttempt';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';

const SHUFFLE_QUESTIONS_NOTE =
  'Порядок вопросов будет другим у каждого сдающего — здесь показан один из вариантов.';
const SHUFFLE_OPTIONS_NOTE =
  'Варианты ответа тоже встанут в другом порядке у каждого сдающего.';
const EMPTY_NOTE = 'В экзамене пока нет вопросов — сдающий увидит пустой экран.';

// Заметки о перемешивании и сам список — колонкой с зазором: у общего
// noteStyle отступов нет, и две заметки подряд слипались бы в один абзац.
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

interface ExamPreviewQuestionsProps {
  itemIds: string[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Сколько вопросов достаётся сдающему из списка (ADR-0082); `undefined` —
   * достаются все, отдельной заметки не нужно. */
  questionsPerAttempt: number | undefined;
  /** Обязательные из них (ADR-0082, дополнение) — уже очищены от вопросов,
   * которых в списке больше нет (ExamPreview.tsx, pruneRequiredIds). */
  requiredIds: string[];
  bankItems: ExamItemDto[];
}

export function ExamPreviewQuestions({
  itemIds,
  shuffleQuestions,
  shuffleOptions,
  questionsPerAttempt,
  requiredIds,
  bankItems,
}: ExamPreviewQuestionsProps) {
  return (
    <section style={sectionStyle}>
      {questionsPerAttempt !== undefined && (
        <p style={noteStyle}>
          {questionsPerAttemptNote(
            questionsPerAttempt,
            itemIds.length,
            requiredIds.length,
          )}
        </p>
      )}
      {shuffleQuestions && <p style={noteStyle}>{SHUFFLE_QUESTIONS_NOTE}</p>}
      {shuffleOptions && <p style={noteStyle}>{SHUFFLE_OPTIONS_NOTE}</p>}
      {itemIds.length === 0 && <p style={noteStyle}>{EMPTY_NOTE}</p>}
      {itemIds.length > 0 && (
        <div style={blockCardStyle}>
          <ol style={dividedListStyle}>
            {itemIds.map((itemId, index) => (
              <ExamPreviewQuestion
                key={itemId}
                index={index}
                item={bankItems.find((candidate) => candidate.id === itemId)}
                required={requiredIds.includes(itemId)}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
