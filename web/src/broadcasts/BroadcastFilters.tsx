// Строка фильтров журнала «Рассылки» — статус переключателями-пилюлями,
// период селектом в конце той же строки (общий components/ListFilters.tsx, как
// на «Экзаменах» и «Вопросах»: направление «Тёплая школа», docs/adr/0043).
// Раньше это были два нативных select с подписями сверху — ряд коробок над
// журналом (отзыв владельца 2026-09-16).
//
// Период остался селектом: три значения, из которых выбирают одно, а ещё
// один ряд переключателей рядом со статусами на 360 px не помещается.
// Подпись «Период» только для скринридера — на экране её заменяет сам выбор
// («2 недели» читается как период без объяснений).
import { BROADCAST_STATUSES, type BroadcastStatus } from '@xuanxue/shared';
import { ListFilters } from '../components/ListFilters';
import { Select } from '../components/Select';
import { BROADCAST_STATUS_LABELS_RU } from './broadcastLabels';
import { JOURNAL_RANGE_OPTIONS, type JournalRangeWeeks } from './broadcastWindow';

const PERIOD_LABEL = 'Период';

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
        <Select
          aria-label={PERIOD_LABEL}
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
        </Select>
      }
    />
  );
}
