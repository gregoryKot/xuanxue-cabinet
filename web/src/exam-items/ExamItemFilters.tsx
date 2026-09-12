// Фильтры банка вопросов — статус, тип, тег (ТЗ 4.2 «Что должен увидеть
// учитель»), по образцу broadcasts/BroadcastFilters.tsx. Тег — свободный
// текст, не перечисление: коммит поля (уход с поля/Enter) — useTextFilterField,
// общая механика с уровнем формы экзамена (exams/ExamFilters.tsx).
import type { CSSProperties } from 'react';
import {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_STATUSES,
  type ExamItemKind,
  type ExamItemStatus,
} from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { useTextFilterField } from '../hooks/useTextFilterField';
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
  const tagFilter = useTextFilterField(values.tag, (tag) => onChange({ ...values, tag }));

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
          value={tagFilter.text}
          onChange={(e) => tagFilter.setText(e.target.value)}
          onBlur={tagFilter.commit}
          onKeyDown={tagFilter.handleKeyDown}
        />
      </Field>
    </div>
  );
}
