// Тип ответа — переключателями, а не выпадающим списком (макет Form.dc.html):
// значений всего четыре, подписи короткие и понятны сами по себе (объяснение
// под каждым убрано — отзыв владельца 2026-09-27). Строка «галочка, подпись»
// — общий components/Toggle.tsx в режиме радио, в строку с переносом
// (flex-wrap), не столбиком: тип ответа — не форма, которую читают сверху
// вниз, а быстрый выбор одного из четырёх коротких слов.
//
// Тип выбирается только при создании (UpdateExamItemInput его не принимает) —
// смена типа значит завести новый вопрос; при правке он показан текстом, не
// молчанием.
import type { CSSProperties } from 'react';
import { EXAM_ITEM_KINDS, type ExamItemKind } from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';
import { EXAM_ITEM_KIND_LABELS_RU } from './examItemLabels';

const LEGEND = 'Тип ответа';
const RADIO_GROUP_NAME = 'exam-item-kind';
const FIXED_NOTE_SUFFIX = ' — чтобы изменить, заведите новый вопрос';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};
const legendStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: 0,
  // legend не участвует в flex-раскладке fieldset (браузер выносит его в
  // отдельную строку сам) — своя ширина 100%, чтобы перенос переключателей
  // начинался с новой строки под подписью, а не рядом с ней.
  width: '100%',
};
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
          checked={kind === option}
          onChange={() => onChange(option)}
        />
      ))}
    </fieldset>
  );
}
