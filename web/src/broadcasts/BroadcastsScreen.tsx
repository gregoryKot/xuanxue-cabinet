// «Рассылки» — числа за 30 дней, потом журнал (docs/PLAN.md §6 п.5,
// docs/adr/0025). Вход в «Каналы» и «Шаблоны постов» — карточками внизу, не
// пунктами меню. «Ждут отправки вручную» — сверху журнала, это нужно сделать
// прямо сейчас. Числа, фильтры, пустое состояние — отдельные компоненты
// (CLAUDE.md «Файлы»).
import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JOURNAL_RANGE_MAX_WEEKS, type BroadcastStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { useChannels } from '../channels/useChannels';
import { ChannelsIcon, TemplatesIcon } from '../app/navIcons';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { useSettings } from '../templates/useSettings';
import { BroadcastCard } from './BroadcastCard';
import { BroadcastFilters } from './BroadcastFilters';
import { BroadcastSheet } from './BroadcastSheet';
import { BroadcastsSummary } from './BroadcastsSummary';
import { DEFAULT_JOURNAL_RANGE_WEEKS } from './broadcastWindow';
import { initialStatusFromQuery } from './broadcastStatusFilter';
import { EmptyJournalState } from './EmptyJournalState';
import { ManualDeliveriesSection } from './ManualDeliveriesSection';
import { useBroadcasts } from './useBroadcasts';
import { useManualDeliveries } from './useManualDeliveries';

// VOICE.md «Начинать с сути, а не с определения темы» — не «Здесь журнал...»
// (pr-k3-fixes.md п.19).
const EXPLANATION =
  'Журнал показывает, что ушло, что ждёт и что не отправилось. Разовую рассылку с ' +
  'текстом на все выбранные каналы можно отправить прямо отсюда.';
const CHANNELS_LINK_HINT =
  'Куда уходят посты. Telegram-группа подключается сама, когда в неё добавили бота.';
const TEMPLATES_LINK_HINT = 'Тексты, которыми бот пишет в канал, и адрес сайта школы.';
const journalListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

export default function BroadcastsScreen() {
  const [searchParams] = useSearchParams();
  const [rangeWeeks, setRangeWeeks] = useState(DEFAULT_JOURNAL_RANGE_WEEKS);
  const [status, setStatus] = useState<BroadcastStatus | ''>(() =>
    initialStatusFromQuery(searchParams.get('status')),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const broadcastsState = useBroadcasts(rangeWeeks, status);
  const channelsState = useChannels();
  const manualState = useManualDeliveries();
  // Только для бейджа пояса школы (pr-k3-fixes.md п.22).
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

  // Композитный onSent (pr-k3-fixes.md п.8): доставка вручную может следом
  // закрыть и саму рассылку — читаем оба списка заново, не только тот.
  async function handleDeliverySent() {
    await manualState.reload();
    await broadcastsState.reload();
  }

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>
      <BroadcastsSummary />
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
      <SectionLink
        to="/channels"
        title="Каналы"
        hint={CHANNELS_LINK_HINT}
        Icon={ChannelsIcon}
      />
      <SectionLink
        to="/templates"
        title="Шаблоны постов"
        hint={TEMPLATES_LINK_HINT}
        Icon={TemplatesIcon}
      />
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
