// Тип ответа — переключателями с объяснением, а не выпадающим списком (макет
// Form.dc.html): значений всего четыре, и по названию не видно, кто проверяет
// ответ — сверяет сам кабинет или читает учитель. Строка «галочка, подпись,
// объяснение» — общий components/Toggle.tsx в режиме радио.
//
// Тип выбирается только при создании (UpdateExamItemInput его не принимает) —
// смена типа значит завести новый вопрос; при правке он показан текстом с
// объяснением, не молчанием.
import type { CSSProperties } from 'react';
import { EXAM_ITEM_KINDS, type ExamItemKind } from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';
import { EXAM_ITEM_KIND_HINTS_RU, EXAM_ITEM_KIND_LABELS_RU } from './examItemLabels';

const LEGEND = 'Тип ответа';
const RADIO_GROUP_NAME = 'exam-item-kind';
const FIXED_NOTE_SUFFIX = ' — чтобы изменить, заведите новый вопрос';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };
const noteStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface ExamItemKindFieldProps {
  kind: ExamItemKind;
  /** Не передан — тип уже зафиксирован, показываем его строкой. */
  onChange?: (kind: ExamItemKind) => void;
}

export function ExamItemKindField({ kind, onChange }: ExamItemKindFieldProps) {
  if (!onChange) {
    return (
      <p style={noteStyle}>
        {LEGEND}: {EXAM_ITEM_KIND_LABELS_RU[kind]}
        {FIXED_NOTE_SUFFIX}
      </p>
    );
  }

  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>{LEGEND}</legend>
      {EXAM_ITEM_KINDS.map((option) => (
        <Toggle
          key={option}
          name={RADIO_GROUP_NAME}
          label={EXAM_ITEM_KIND_LABELS_RU[option]}
          hint={EXAM_ITEM_KIND_HINTS_RU[option]}
          checked={kind === option}
          onChange={() => onChange(option)}
        />
      ))}
    </fieldset>
  );
}
