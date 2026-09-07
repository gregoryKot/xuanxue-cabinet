// Фильтры журнала «Рассылки» — период и статус (pr-k3-fixes.md п.13):
// через общий Field/inputStyle, высота ≥44px (CLAUDE.md «Доступность»),
// как остальные контролы кабинета, а не голый `<label><select>`.
import type { CSSProperties } from 'react';
import { BROADCAST_STATUSES, type BroadcastStatus } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { BROADCAST_STATUS_LABELS_RU } from './broadcastLabels';
import { JOURNAL_RANGE_OPTIONS, type JournalRangeWeeks } from './broadcastWindow';

const filtersStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };

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
    <div style={filtersStyle}>
      <Field label="Период">
        <select
          style={inputStyle}
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
      </Field>
      <Field label="Статус">
        <select
          style={inputStyle}
          value={status}
          onChange={(e) => onStatusChange(e.target.value as BroadcastStatus | '')}
        >
          <option value="">Все</option>
          {BROADCAST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BROADCAST_STATUS_LABELS_RU[s]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
