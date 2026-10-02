// Один вопрос в предпросмотре «глазами ученика» (ТЗ 4.3): формулировка и поле
// ответа по типу — общий AttemptAnswerFields.tsx (те же компоненты, что у
// сдачи, но всегда неактивные): предпросмотр показывает сохранённый экзамен,
// а не форму сдачи, отвечать здесь нельзя. Видео-вопрос — тот же
// AttemptQuestionVideo.tsx, что видит ученик, с `disabled` (отзыв владельца
// 2026-10-02: раньше здесь стояла своя заглушка в одну строку). Строка
// вопроса — общий components/QuestionRow.tsx (его же комментарий-шапка про то,
// почему общий).
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { AttemptAnswerFields } from '../attempt/AttemptAnswerFields';
import { AttemptQuestionVideo } from '../attempt/AttemptQuestionVideo';
import type { AttemptVideoControls } from '../attempt/useAttemptMedia';
import { QuestionRow } from '../components/QuestionRow';

const MISSING_NOTE = 'Вопрос недоступен — его удалили или спрятали в черновик.';
const REQUIRED_TEXT = 'Обязательный';

// Отдельной строкой над полем ответа, а не суффиксом формулировки: у
// QuestionRow формулировка — `aria-labelledby` поля ответа, добавлять туда
// служебный текст значило бы читать его скринридеру при каждом фокусе поля.
const requiredStyle: CSSProperties = { fontSize: 13, color: 'var(--terracotta-text)' };

interface ExamPreviewQuestionProps {
  index: number;
  item?: ExamItemDto;
  /** Отметка ★ «обязательный» (ADR-0082, дополнение) — попадает каждому
   * сдающему при любой случайной выборке; без неё пропуск. */
  required?: boolean;
  /** Управление блоком видео-вопроса (previewVideoControls.ts). */
  video: AttemptVideoControls;
}

export function ExamPreviewQuestion({
  index,
  item,
  required,
  video,
}: ExamPreviewQuestionProps) {
  if (!item) {
    return (
      <QuestionRow
        index={index}
        promptId={`preview-prompt-${index}`}
        prompt={MISSING_NOTE}
      />
    );
  }

  const promptId = `preview-prompt-${item.id}`;

  return (
    <QuestionRow
      index={index}
      promptId={promptId}
      prompt={item.prompt}
      videoId={item.videoId}
      videoUrl={item.videoUrl}
    >
      {required && <span style={requiredStyle}>{REQUIRED_TEXT}</span>}
      {item.kind !== 'video' && (
        <AttemptAnswerFields
          labelledBy={promptId}
          itemId={item.id}
          kind={item.kind}
          options={item.options}
          askReason={item.askReason}
        />
      )}
      {item.kind === 'video' && (
        <AttemptQuestionVideo itemId={item.id} video={video} disabled />
      )}
    </QuestionRow>
  );
}
