// «О чём экзамен» — первый блок полей страницы редактора (макет Form.dc.html):
// название и уровень в одной строке на широком экране (уровень — узкое поле,
// класс .xuanxue-title-level-row в index.css), ниже — текст для ученика.
// Подсказка у уровня — всплывающая (components/InfoTip.tsx, ADR-0139):
// подпись «Подпись уровня» не объясняла, куда именно попадает текст,
// «непонятно, что это, даже после объяснения» (отзыв владельца 2026-09-27) —
// переименовано в «Уровень» с примером в placeholder, а что уровень ни на что
// не влияет (ни на доступ, ни на выдачу — ADR-0033, отзыв владельца
// 2026-09-15), по-прежнему верно и написано в подсказке.
import type { CSSProperties } from 'react';
import { EXAM_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { ExamFormState } from './examFormInput';

const LEVEL_TIP = 'Ученик увидит его в скобках после названия.';
const LEVEL_PLACEHOLDER = 'первый год';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
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
      <div className="xuanxue-title-level-row">
        <Field label="Название" error={error ?? undefined}>
          <input
            style={inputStyle}
            maxLength={EXAM_LIMITS.title}
            value={state.title}
            onChange={(e) => setField('title', e.target.value)}
          />
        </Field>

        <Field label="Уровень" tip={LEVEL_TIP}>
          <input
            style={inputStyle}
            placeholder={LEVEL_PLACEHOLDER}
            maxLength={EXAM_LIMITS.level}
            value={state.level}
            onChange={(e) => setField('level', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Описание для ученика">
        <textarea
          style={textareaStyle}
          maxLength={EXAM_LIMITS.description}
          value={state.description}
          onChange={(e) => setField('description', e.target.value)}
        />
      </Field>
    </div>
  );
}
