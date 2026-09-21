// Один вопрос в предпросмотре «глазами ученика» (ТЗ 4.3): формулировка и поле
// ответа по типу — те же компоненты, что у сдачи (attempt/AttemptQuestion*.tsx),
// но всегда неактивные: предпросмотр показывает сохранённый экзамен, а не
// форму сдачи, отвечать здесь нельзя. Строка вопроса — общий
// components/QuestionRow.tsx (его же комментарий-шапка про то, почему общий).
//
// Пропсы у компонентов сдачи обязательные — там без обработчика нельзя.
// `IGNORE_INPUT` — пустой обработчик: поля выключены (`disabled`), реально не
// вызывается.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { AttemptQuestionChoice } from '../attempt/AttemptQuestionChoice';
import { AttemptQuestionText } from '../attempt/AttemptQuestionText';
import { AttemptQuestionVideoNote } from '../attempt/AttemptQuestionVideo';
import { QuestionRow } from '../components/QuestionRow';

const MISSING_NOTE = 'Вопрос недоступен — его удалили или спрятали в черновик.';
const REQUIRED_TEXT = 'Обязательный';

const IGNORE_INPUT = () => undefined;
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
}

export function ExamPreviewQuestion({ index, item, required }: ExamPreviewQuestionProps) {
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
    <QuestionRow index={index} promptId={promptId} prompt={item.prompt} hint={item.hint}>
      {required && <span style={requiredStyle}>{REQUIRED_TEXT}</span>}
      {item.kind === 'text' && (
        <AttemptQuestionText
          labelledBy={promptId}
          value=""
          disabled
          onChange={IGNORE_INPUT}
          onBlur={IGNORE_INPUT}
        />
      )}
      {(item.kind === 'single' || item.kind === 'multiple') && (
        <AttemptQuestionChoice
          labelledBy={promptId}
          itemId={item.id}
          kind={item.kind}
          options={item.options}
          selected={[]}
          disabled
          onChange={IGNORE_INPUT}
        />
      )}
      {item.kind === 'video' && <AttemptQuestionVideoNote />}
    </QuestionRow>
  );
}
