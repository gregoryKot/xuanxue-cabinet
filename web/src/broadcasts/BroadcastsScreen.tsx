// «Рассылки» — журнал того, что ушло и что ждёт (docs/PLAN.md §6 п.5).
// Блок «Ждут отправки вручную» — то, что нужно сделать прямо сейчас, поэтому
// сверху, до журнала (CLAUDE.md «Каждая фича объясняет откуда это и зачем»).
// `useManualDeliveries()` живёт здесь, не в секции (pr-k3-fixes.md п.7):
// `useScrollToHash` для якоря `#manual` ждёт, пока блок точно отрисован
// (не грузится и не в ошибке), а секция сама этого не знает. Фильтры и
// пустое состояние — отдельные компоненты (CLAUDE.md «Файлы» — 150 строк).
import { useMemo, useState, type CSSProperties } from 'react';
import { JOURNAL_RANGE_MAX_WEEKS, type BroadcastStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { useChannels } from '../channels/useChannels';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { useSettings } from '../templates/useSettings';
import { BroadcastCard } from './BroadcastCard';
import { BroadcastFilters } from './BroadcastFilters';
import { BroadcastSheet } from './BroadcastSheet';
import { DEFAULT_JOURNAL_RANGE_WEEKS } from './broadcastWindow';
import { EmptyJournalState } from './EmptyJournalState';
import { ManualDeliveriesSection } from './ManualDeliveriesSection';
import { useBroadcasts } from './useBroadcasts';
import { useManualDeliveries } from './useManualDeliveries';

// VOICE.md «Начинать с сути, а не с определения темы» — не «Здесь журнал...»
// (pr-k3-fixes.md п.19).
const EXPLANATION =
  'Журнал показывает, что ушло, что ждёт и что не отправилось. Разовую рассылку с ' +
  'текстом на все выбранные каналы можно отправить прямо отсюда.';

const journalListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

export default function BroadcastsScreen() {
  const [rangeWeeks, setRangeWeeks] = useState(DEFAULT_JOURNAL_RANGE_WEEKS);
  const [status, setStatus] = useState<BroadcastStatus | ''>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const broadcastsState = useBroadcasts(rangeWeeks, status);
  const channelsState = useChannels();
  const manualState = useManualDeliveries();
  // Только для бейджа пояса школы рядом со временем (pr-k3-fixes.md п.22) —
  // сбой или загрузка настроек не блокируют журнал: badge просто не покажется.
  const settingsState = useSettings();

  useScrollToHash(!manualState.loading && !manualState.error);

  const channelsById = useMemo(
    () => new Map((channelsState.channels ?? []).map((channel) => [channel.id, channel])),
    [channelsState.channels],
  );
  const activeChannels = useMemo(
    () => (channelsState.channels ?? []).filter((channel) => channel.active),
    [channelsState.channels],
  );

  const loading = broadcastsState.loading || channelsState.loading;
  const error = broadcastsState.error ?? channelsState.error;
  const isEmpty = !loading && !error && broadcastsState.broadcasts?.length === 0;

  function retry() {
    void broadcastsState.reload();
    void channelsState.reload();
  }

  // Композитный onSent (pr-k3-fixes.md п.8): «Отметить отправленным» меняет
  // статус доставки, а следом может закрыть и саму рассылку (все доставки
  // sent) — читаем оба списка заново, а не только тот, где нажали кнопку.
  async function handleDeliverySent() {
    await manualState.reload();
    await broadcastsState.reload();
  }

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {!loading && <Button onClick={() => setSheetOpen(true)}>Новая рассылка</Button>}

      <ManualDeliveriesSection
        deliveries={manualState.deliveries}
        loading={manualState.loading}
        error={manualState.error}
        onRetry={() => void manualState.reload()}
        channelsById={channelsById}
        onSent={handleDeliverySent}
      />

      <BroadcastFilters
        rangeWeeks={rangeWeeks}
        onRangeWeeksChange={setRangeWeeks}
        status={status}
        onStatusChange={setStatus}
      />

      {error && <LoadErrorBanner message={error} onRetry={retry} />}

      {loading && !error && <SkeletonList rows={4} h={90} />}

      {isEmpty && (
        <EmptyJournalState
          isFiltered={status !== ''}
          rangeWeeks={rangeWeeks}
          onResetStatus={() => setStatus('')}
          onWidenRange={() => setRangeWeeks(JOURNAL_RANGE_MAX_WEEKS)}
        />
      )}

      {!loading &&
        !error &&
        broadcastsState.broadcasts &&
        broadcastsState.broadcasts.length > 0 && (
          <ul style={journalListStyle}>
            {broadcastsState.broadcasts.map((broadcast) => (
              <BroadcastCard
                key={broadcast.id}
                broadcast={broadcast}
                channelsById={channelsById}
                onCancel={broadcastsState.cancel}
                onDeliverySent={handleDeliverySent}
                schoolTz={settingsState.settings?.tz}
              />
            ))}
          </ul>
        )}

      {sheetOpen && (
        <BroadcastSheet
          channels={activeChannels}
          onClose={() => setSheetOpen(false)}
          onCreate={broadcastsState.create}
        />
      )}
    </section>
  );
}
