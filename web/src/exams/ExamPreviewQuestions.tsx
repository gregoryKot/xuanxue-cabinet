// Список вопросов в предпросмотре «глазами ученика» — по порядку снимка
// формы. Список лежит в карточке, как на экране сдачи
// (attempt/AttemptInProgress.tsx, направление «Тёплая школа», docs/adr/0043)
// — вопросы внутри карточки по-прежнему разделены волосяными линиями строк
// (.xuanxue-question-row, components/QuestionRow.tsx), а не рамкой.
//
// Заметка над списком — одна строка (previewNote.ts, отзыв владельца
// 2026-09-27): раньше здесь были две подряд («сколько вопросов достанется» и
// «перемешивается ли порядок») об одном и том же — у каждого сдающего свой
// набор и свой порядок.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { blockCardStyle, dividedListStyle } from '../components/listCardStyles';
import { noteStyle } from '../components/screenLayout';
import { RichText } from '../components/RichText';
import { previewNote } from './previewNote';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';

const EMPTY_NOTE = 'В экзамене пока нет вопросов — сдающий увидит **пустой экран**.';

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
  const note = previewNote({
    itemCount: itemIds.length,
    questionsPerAttempt,
    requiredCount: requiredIds.length,
    shuffleQuestions,
    shuffleOptions,
  });

  return (
    <section style={sectionStyle}>
      {note && (
        <p style={noteStyle}>
          <RichText text={note} />
        </p>
      )}
      {itemIds.length === 0 && (
        <p style={noteStyle}>
          <RichText text={EMPTY_NOTE} />
        </p>
      )}
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
