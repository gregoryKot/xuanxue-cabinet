// Фильтры списка форм — статус, уровень (ТЗ 4.3 «Список»), по образцу
// exam-items/ExamItemFilters.tsx. Уровень — свободный текст с точным
// совпадением на сервере (ExamsService.list), коммит поля — useTextFilterField,
// та же механика, что у тега вопроса.
import type { CSSProperties } from 'react';
import { EXAM_STATUSES, type ExamStatus } from '@xuanxue/shared';
// Подписи статуса — общие с вопросом банка: тот же набор значений и тот же
// смысл (черновик/опубликован/архив), lib/statusTransitions.ts через
// examItemLabels.ts (решение агента: разводить на два одинаковых словаря
// смысла не имеет, пока значения совпадают).
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';
import { Field, inputStyle } from '../components/Field';
import { useTextFilterField } from '../hooks/useTextFilterField';

export interface ExamFilterValues {
  status: ExamStatus | '';
  level: string;
}

const filtersStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };

interface ExamFiltersProps {
  values: ExamFilterValues;
  onChange: (values: ExamFilterValues) => void;
}

export function ExamFilters({ values, onChange }: ExamFiltersProps) {
  const levelFilter = useTextFilterField(values.level, (level) =>
    onChange({ ...values, level }),
  );

  return (
    <div style={filtersStyle}>
      <Field label="Статус">
        <select
          style={inputStyle}
          value={values.status}
          onChange={(e) =>
            onChange({ ...values, status: e.target.value as ExamStatus | '' })
          }
        >
          <option value="">Все</option>
          {EXAM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[status]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Уровень">
        <input
          style={inputStyle}
          value={levelFilter.text}
          onChange={(e) => levelFilter.setText(e.target.value)}
          onBlur={levelFilter.commit}
          onKeyDown={levelFilter.handleKeyDown}
        />
      </Field>
    </div>
  );
}
