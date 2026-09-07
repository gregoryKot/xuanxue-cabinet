// Пустой журнал с активным фильтром — не тупик: предложить снять фильтр
// статуса или расширить период, а не молча показать «рассылок нет»
// (pr-k3-fixes.md п.18, CLAUDE.md «Продукт»).
import type { CSSProperties } from 'react';
import { JOURNAL_RANGE_MAX_WEEKS } from '@xuanxue/shared';
import { Button } from '../components/Button';
import type { JournalRangeWeeks } from './broadcastWindow';

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const actionsStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

interface EmptyJournalStateProps {
  isFiltered: boolean;
  rangeWeeks: JournalRangeWeeks;
  onResetStatus: () => void;
  onWidenRange: () => void;
}

export function EmptyJournalState({
  isFiltered,
  rangeWeeks,
  onResetStatus,
  onWidenRange,
}: EmptyJournalStateProps) {
  const canWiden = rangeWeeks !== JOURNAL_RANGE_MAX_WEEKS;

  return (
    <div style={wrapperStyle}>
      <p style={{ margin: 0 }}>
        {isFiltered
          ? 'С этим статусом рассылок за период нет.'
          : 'За этот период рассылок нет.'}
      </p>
      {(isFiltered || canWiden) && (
        <div style={actionsStyle}>
          {isFiltered && (
            <Button variant="secondary" onClick={onResetStatus}>
              Показать все статусы
            </Button>
          )}
          {canWiden && (
            <Button variant="secondary" onClick={onWidenRange}>
              Расширить период до {JOURNAL_RANGE_MAX_WEEKS} недель
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
