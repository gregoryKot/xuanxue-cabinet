// Фильтры списка форм — статус переключателями-вкладками и поиск по
// названию (направление «тихо и благородно», Main.dc.html). Было — select
// «Статус» + текстовый фильтр «Уровень» (ТЗ 4.3 «Список»); макет заменил их
// текстовыми переключателями и строкой поиска. Уровень остаётся полем формы
// (ExamFormFields.tsx) и параметром API (`/exams?level=`) — решение агента:
// в строке фильтров ему не нашлось места, а нужный случай («все формы
// одного уровня») закрывает поиск по названию и фильтр статуса. Поиск — по
// уже загруженному списку (examSearch.ts): бэкенд текстовый поиск по title
// не отдаёт, заводить новый эндпоинт ради строки заголовка не стоит.
import type { CSSProperties } from 'react';
import { EXAM_STATUSES, type ExamStatus } from '@xuanxue/shared';
import { inputStyle } from '../components/Field';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';

export interface ExamFilterValues {
  status: ExamStatus | '';
}

const ALL_OPTION = { status: '' as const, label: 'Все' };
const SEARCH_LABEL = 'Поиск по названию';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 20,
  paddingBottom: 14,
  borderBottom: '1px solid var(--line)',
};
const toggleGroupStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
// Свойства рамки — раздельными полями (border-bottom-*), не шорткатом
// `borderBottom`: активное состояние меняет только цвет и толщину, а React
// предупреждает при смене шортката на отдельное поле между рендерами.
const toggleBaseStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 8px',
  background: 'transparent',
  border: 'none',
  borderBottomStyle: 'solid',
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 400,
  color: 'var(--ink-soft)',
  cursor: 'pointer',
};
// Активный переключатель — тушь и подчёркивание, не заливка (CLAUDE.md
// «Правило акцента»: киноварь уже занята кнопкой «Новый экзамен» на этом
// экране, здесь — только линия под текстом, не второе красное пятно).
const toggleActiveStyle: CSSProperties = {
  color: 'var(--ink)',
  fontWeight: 500,
  borderBottomColor: 'var(--ink)',
};
const searchWrapStyle: CSSProperties = {
  marginLeft: 'auto',
  flex: '1 1 200px',
  maxWidth: 280,
};
const searchInputStyle: CSSProperties = { ...inputStyle, width: '100%' };

interface ExamFiltersProps {
  values: ExamFilterValues;
  onChange: (values: ExamFilterValues) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export function ExamFilters({
  values,
  onChange,
  search,
  onSearchChange,
}: ExamFiltersProps) {
  const options = [
    ALL_OPTION,
    ...EXAM_STATUSES.map((status) => ({
      status,
      label: DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[status],
    })),
  ];

  return (
    <div style={rowStyle}>
      <div style={toggleGroupStyle} role="group" aria-label="Статус">
        {options.map((option) => (
          <button
            key={option.status || 'all'}
            type="button"
            style={
              values.status === option.status
                ? { ...toggleBaseStyle, ...toggleActiveStyle }
                : toggleBaseStyle
            }
            aria-pressed={values.status === option.status}
            onClick={() => onChange({ status: option.status })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label style={searchWrapStyle}>
        <span className="xuanxue-sr-only">{SEARCH_LABEL}</span>
        <input
          type="search"
          style={searchInputStyle}
          placeholder={SEARCH_LABEL}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </label>
    </div>
  );
}
