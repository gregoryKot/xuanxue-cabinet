// «О чём экзамен» — первый блок полей страницы редактора (макет Form.dc.html):
// название, текст для ученика и подпись уровня. Подсказка у уровня говорит
// правду: раньше здесь стояло «пусто — форма доступна всем уровням», хотя
// уровень ни на что не влияет — ни на доступ, ни на выдачу (ADR-0033, отзыв
// владельца 2026-09-15).
import type { CSSProperties } from 'react';
import { EXAM_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { ExamFormState } from './examFormInput';

const DESCRIPTION_HINT = 'Ученик видит этот текст перед началом.';
const LEVEL_HINT = 'Показывается ученику рядом с названием. Ни на что больше не влияет.';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 90, resize: 'vertical' };

interface ExamAboutFieldsProps {
  state: ExamFormState;
  setField: <K extends keyof ExamFormState>(key: K, value: ExamFormState[K]) => void;
  /** Общая ошибка формы — под первым содержательным полем (название), как в
   * exam-items/ExamItemFormFields.tsx. */
  error: string | null;
}

export function ExamAboutFields({ state, setField, error }: ExamAboutFieldsProps) {
  return (
    <div style={columnStyle}>
      <Field label="Название" error={error ?? undefined}>
        <input
          style={inputStyle}
          maxLength={EXAM_LIMITS.title}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      <Field label="Описание для ученика" hint={DESCRIPTION_HINT}>
        <textarea
          style={textareaStyle}
          maxLength={EXAM_LIMITS.description}
          value={state.description}
          onChange={(e) => setField('description', e.target.value)}
        />
      </Field>

      <Field label="Подпись уровня" hint={LEVEL_HINT}>
        <input
          style={inputStyle}
          maxLength={EXAM_LIMITS.level}
          value={state.level}
          onChange={(e) => setField('level', e.target.value)}
        />
      </Field>
    </div>
  );
}
