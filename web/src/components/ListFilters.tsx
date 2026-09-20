// Строка фильтров списка раздела — статус переключателями-пилюлями и поиск
// одной строкой. Один компонент на «Экзамены», «Вопросы» и «Рассылки»: раньше
// это была exams/ExamFilters.tsx, и каждый раздел скопировал бы её целиком
// (CLAUDE.md «Одна механика — один компонент», jscpd). Что искать — решает
// экран: форму ищут по названию, вопрос — по формулировке и тегу
// (lib/textSearch.ts, фильтр локальный: текстового поиска у бэкенда нет, а
// список и так с лимитом).
//
// Пилюли — направление «Тёплая школа» (docs/adr/0043-visual-direction-warm-
// school.md), макет экрана «Рассылки»: раньше активный статус метился
// подчёркиванием снизу (направление «тихо и благородно», ADR-0031), теперь —
// заливкой --ink целиком. Общий компонент — значит, пилюли приезжают сразу на
// все три экрана, не только на «Рассылки» (CLAUDE.md «Одна механика — один
// компонент»).
import type { CSSProperties, ReactNode } from 'react';
import { inputStyle } from './Field';
import { pillActiveStyle, pillStyle } from './pillStyles';

const ALL_LABEL = 'Все';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 20,
  paddingBottom: 14,
  borderBottom: '1px solid var(--line)',
};
const toggleGroupStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
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

const DEFAULT_GROUP_LABEL = 'Статус';

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
  /** aria-label группы пилюль — по умолчанию «Статус» (экзамены, вопросы,
   * рассылки), но пилюли тегов материалов (ADR-0058) — не статус, и жёсткая
   * подпись читалась бы скринридеру неверно. */
  groupLabel?: string;
}

export function ListFilters<TStatus extends string>({
  statuses,
  labels,
  value,
  onChange,
  search,
  trailing,
  groupLabel = DEFAULT_GROUP_LABEL,
}: ListFiltersProps<TStatus>) {
  const options: { status: TStatus | ''; label: string }[] = [
    { status: '', label: ALL_LABEL },
    ...statuses.map((status) => ({ status, label: labels[status] })),
  ];

  return (
    <div style={rowStyle}>
      <div style={toggleGroupStyle} role="group" aria-label={groupLabel}>
        {options.map((option) => (
          <button
            key={option.status || 'all'}
            type="button"
            style={
              value === option.status ? { ...pillStyle, ...pillActiveStyle } : pillStyle
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
