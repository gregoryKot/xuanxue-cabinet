// Фильтры банка вопросов — статус, тип, тег (ТЗ 4.2 «Что должен увидеть
// учитель»), по образцу broadcasts/BroadcastFilters.tsx. Тег — свободный
// текст, не перечисление: запрос уходит по уходу с поля или «Enter», а не на
// каждое нажатие клавиши — иначе список мигал бы на каждую букву.
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_STATUSES,
  type ExamItemKind,
  type ExamItemStatus,
} from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { EXAM_ITEM_KIND_LABELS_RU, EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';

export interface ExamItemFilterValues {
  status: ExamItemStatus | '';
  kind: ExamItemKind | '';
  tag: string;
}

const filtersStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };

interface ExamItemFiltersProps {
  values: ExamItemFilterValues;
  onChange: (values: ExamItemFilterValues) => void;
}

export function ExamItemFilters({ values, onChange }: ExamItemFiltersProps) {
  const [tagText, setTagText] = useState(values.tag);
  // Внешний сброс фильтра (например, кнопкой «Сбросить») должен отразиться
  // в поле — иначе после сброса в инпуте остался бы старый текст.
  useEffect(() => setTagText(values.tag), [values.tag]);

  function commitTag() {
    const trimmed = tagText.trim();
    if (trimmed !== values.tag) onChange({ ...values, tag: trimmed });
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitTag();
  }

  return (
    <div style={filtersStyle}>
      <Field label="Статус">
        <select
          style={inputStyle}
          value={values.status}
          onChange={(e) =>
            onChange({ ...values, status: e.target.value as ExamItemStatus | '' })
          }
        >
          <option value="">Все</option>
          {EXAM_ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {EXAM_ITEM_STATUS_LABELS_RU[status]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Тип">
        <select
          style={inputStyle}
          value={values.kind}
          onChange={(e) =>
            onChange({ ...values, kind: e.target.value as ExamItemKind | '' })
          }
        >
          <option value="">Все</option>
          {EXAM_ITEM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {EXAM_ITEM_KIND_LABELS_RU[kind]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Тег">
        <input
          style={inputStyle}
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          onBlur={commitTag}
          onKeyDown={handleTagKeyDown}
        />
      </Field>
    </div>
  );
}
