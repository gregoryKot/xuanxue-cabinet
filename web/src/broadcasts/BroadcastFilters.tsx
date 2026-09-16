// Строка фильтров журнала «Рассылки» — статус переключателями, период
// селектом в конце той же строки (общий components/ListFilters.tsx, как на
// «Экзаменах» и «Вопросах»: направление «тихо и благородно», docs/adr/0031).
// Раньше это были два нативных select с подписями сверху — ряд коробок над
// журналом (отзыв владельца 2026-09-16).
//
// Период остался селектом: три значения, из которых выбирают одно, а ещё
// один ряд переключателей рядом со статусами на 360 px не помещается.
// Подпись «Период» только для скринридера — на экране её заменяет сам выбор
// («2 недели» читается как период без объяснений).
import type { CSSProperties } from 'react';
import { BROADCAST_STATUSES, type BroadcastStatus } from '@xuanxue/shared';
import { inputStyle } from '../components/Field';
import { ListFilters } from '../components/ListFilters';
import { BROADCAST_STATUS_LABELS_RU } from './broadcastLabels';
import { JOURNAL_RANGE_OPTIONS, type JournalRangeWeeks } from './broadcastWindow';

const PERIOD_LABEL = 'Период';

const selectStyle: CSSProperties = { ...inputStyle, width: '100%' };

interface BroadcastFiltersProps {
  rangeWeeks: JournalRangeWeeks;
  onRangeWeeksChange: (weeks: JournalRangeWeeks) => void;
  status: BroadcastStatus | '';
  onStatusChange: (status: BroadcastStatus | '') => void;
}

export function BroadcastFilters({
  rangeWeeks,
  onRangeWeeksChange,
  status,
  onStatusChange,
}: BroadcastFiltersProps) {
  return (
    <ListFilters
      statuses={BROADCAST_STATUSES}
      labels={BROADCAST_STATUS_LABELS_RU}
      value={status}
      onChange={onStatusChange}
      trailing={
        <select
          aria-label={PERIOD_LABEL}
          style={selectStyle}
          value={rangeWeeks}
          onChange={(e) =>
            onRangeWeeksChange(Number(e.target.value) as JournalRangeWeeks)
          }
        >
          {JOURNAL_RANGE_OPTIONS.map((option) => (
            <option key={option.weeks} value={option.weeks}>
              {option.label}
            </option>
          ))}
        </select>
      }
    />
  );
}
