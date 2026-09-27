// Содержательное поле вопроса — формулировка и видео к ней (ADR-0133). Тип
// ответа стоит выше отдельным блоком переключателей (ExamItemKindField.tsx):
// он выбирается один раз и потом не меняется. Подсказка ученику, критерии
// проверки и теги убраны из вопроса вместе с полями (ADR-0128).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { ExamVideoField } from './ExamVideoField';
import type { ExamVideoValue } from './examVideoFormInput';
import { hasOptions, type ExamItemFormState } from './examItemFormInput';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 90, resize: 'vertical' };

// VOICE: до первого действия — зачем видео вопросу (CLAUDE.md «откуда это и
// зачем»). Пример из отзыва владельца 2026-09-23 (ADR-0133): формулировка
// «что не так в этом движении».
const VIDEO_HINT = 'Покажите движение — ученик ответит, что в нём не так';
// У single/multiple видео вопроса — необязательное общее видео формулировки,
// а второй ролик (для сравнения вариантов) живёт у каждого варианта своим
// полем (ExamItemOptionsField.tsx) — общая подсказка про «что не так»
// уводила бы туда, где второго видео просто нет (отзыв владельца с телефона:
// «как прикрепить второй ролик?»).
const CHOICE_VIDEO_HINT =
  'Ролики для выбора добавьте к вариантам ниже — у каждого варианта своё видео.';

function videoHint(kind: ExamItemFormState['kind']): string {
  return hasOptions(kind) ? CHOICE_VIDEO_HINT : VIDEO_HINT;
}

interface ExamItemFormFieldsProps {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
  /** Общая ошибка формы — как в ExamAboutFields.tsx, показывается под первым
   * содержательным полем (формулировка), не под каждым отдельно. */
  error: string | null;
  /** Загрузка в R2 подключена — решает, что рисует ExamVideoField: кнопку
   * файла или поле ссылки (ADR-0133). */
  fileStorageEnabled: boolean;
}

export function ExamItemFormFields({
  state,
  setField,
  error,
  fileStorageEnabled,
}: ExamItemFormFieldsProps) {
  function handleVideoChange(next: ExamVideoValue) {
    setField('videoId', next.videoId);
    setField('videoUrl', next.videoUrl);
  }

  return (
    <div style={columnStyle}>
      <Field label="Формулировка" error={error ?? undefined}>
        <textarea
          style={textareaStyle}
          maxLength={EXAM_ITEM_LIMITS.prompt}
          value={state.prompt}
          onChange={(e) => setField('prompt', e.target.value)}
        />
      </Field>
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={videoHint(state.kind)}
        value={{ videoId: state.videoId, videoUrl: state.videoUrl }}
        fileStorageEnabled={fileStorageEnabled}
        onChange={handleVideoChange}
      />
    </div>
  );
}
