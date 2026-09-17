// Строка фильтров списка раздела — статус текстовыми переключателями и поиск
// одной строкой (направление «тихо и благородно», Main.dc.html). Один
// компонент на «Экзамены» и «Вопросы»: раньше это была exams/ExamFilters.tsx,
// и банк вопросов скопировал бы её целиком (CLAUDE.md «Одна механика — один
// компонент», jscpd). Что искать — решает экран: форму ищут по названию,
// вопрос — по формулировке и тегу (lib/textSearch.ts, фильтр локальный:
// текстового поиска у бэкенда нет, а список и так с лимитом).
import type { CSSProperties, ReactNode } from 'react';
import { inputStyle } from './Field';

const ALL_LABEL = 'Все';

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
// «Правило акцента»: киноварь уже занята главной кнопкой экрана, здесь —
// только линия под текстом, не второе красное пятно).
const toggleActiveStyle: CSSProperties = {
  color: 'var(--ink)',
  fontWeight: 500,
  borderBottomColor: 'var(--ink)',
};
const trailingStyle: CSSProperties = {
  marginLeft: 'auto',
  flex: '1 1 200px',
  maxWidth: 280,
};
const searchInputStyle: CSSProperties = { ...inputStyle, width: '100%' };

/** Поиск по уже загруженному списку. Подпись видна плейсхолдером и
 * скринридеру, на экране не дублируется. Не передан — строка остаётся с
 * одними переключателями: в журнале рассылок искать по тексту незачем, там
 * фильтруют период и статус. */
interface ListSearch {
  label: string;
  value: string;
  onChange: (search: string) => void;
}

interface ListFiltersProps<TStatus extends string> {
  statuses: readonly TStatus[];
  labels: Record<TStatus, string>;
  /** Пустая строка — «Все». */
  value: TStatus | '';
  onChange: (status: TStatus | '') => void;
  search?: ListSearch;
  /** Свой контрол в конце строки — период журнала рассылок. Стоит там же,
   * где поиск: справа от переключателей, одной строкой с ними. */
  trailing?: ReactNode;
}

export function ListFilters<TStatus extends string>({
  statuses,
  labels,
  value,
  onChange,
  search,
  trailing,
}: ListFiltersProps<TStatus>) {
  const options: { status: TStatus | ''; label: string }[] = [
    { status: '', label: ALL_LABEL },
    ...statuses.map((status) => ({ status, label: labels[status] })),
  ];

  return (
    <div style={rowStyle}>
      <div style={toggleGroupStyle} role="group" aria-label="Статус">
        {options.map((option) => (
          <button
            key={option.status || 'all'}
            type="button"
            style={
              value === option.status
                ? { ...toggleBaseStyle, ...toggleActiveStyle }
                : toggleBaseStyle
            }
            aria-pressed={value === option.status}
            onClick={() => onChange(option.status)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {search && (
        <label style={trailingStyle}>
          <span className="xuanxue-sr-only">{search.label}</span>
          <input
            type="search"
            style={searchInputStyle}
            placeholder={search.label}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </label>
      )}
      {trailing && <div style={trailingStyle}>{trailing}</div>}
    </div>
  );
}
