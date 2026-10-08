// «Рассылки» — числа за 30 дней, потом журнал (docs/PLAN.md §6 п.5,
// docs/adr/0025). Вход в «Каналы» и «Шаблоны» — вторичные кнопки в шапке
// (ScreenActions.tsx, дополнение 2026-10-08): внизу под журналом их надо было
// долистывать, не пунктами меню. «Ждут отправки вручную» — сверху журнала, это нужно сделать
// прямо сейчас. Новая рассылка — страница `/broadcasts/new`
// (BroadcastNewScreen.tsx, ADR-0033), отсюда только переход. Числа, фильтры,
// пустое состояние — отдельные компоненты (CLAUDE.md «Файлы»).
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { JOURNAL_RANGE_MAX_WEEKS, type BroadcastStatus } from '@xuanxue/shared';
import { oneCardListStyle } from '../components/listCardStyles';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenActions, type ScreenAction } from '../components/ScreenActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { useChannels } from '../channels/useChannels';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { useSettings } from '../templates/useSettings';
import { BroadcastCard } from './BroadcastCard';
import { BroadcastFilters } from './BroadcastFilters';
import { BroadcastsSummary } from './BroadcastsSummary';
import { DEFAULT_JOURNAL_RANGE_WEEKS } from './broadcastWindow';
import { initialStatusFromQuery } from './broadcastStatusFilter';
import { EmptyJournalState } from './EmptyJournalState';
import { ManualDeliveriesSection } from './ManualDeliveriesSection';
import { useBroadcasts } from './useBroadcasts';
import { useManualDeliveries } from './useManualDeliveries';

const TITLE = 'Рассылки';
// VOICE.md «Начинать с сути, а не с определения темы» — не «Здесь журнал...»
// (pr-k3-fixes.md п.19).
const EXPLANATION = 'Журнал показывает, что ушло, что ждёт и что не отправилось.';
const BROADCASTS_PATH = '/broadcasts';
const CHANNELS_PATH = '/channels';
const TEMPLATES_PATH = '/templates';

export default function BroadcastsScreen() {
  const [searchParams] = useSearchParams();
  const [rangeWeeks, setRangeWeeks] = useState(DEFAULT_JOURNAL_RANGE_WEEKS);
  const [status, setStatus] = useState<BroadcastStatus | ''>(() =>
    initialStatusFromQuery(searchParams.get('status')),
  );
  const broadcastsState = useBroadcasts(rangeWeeks, status);
  const channelsState = useChannels();
  const manualState = useManualDeliveries();
  const navigate = useNavigate();
  // Только для бейджа пояса школы (pr-k3-fixes.md п.22).
  const settingsState = useSettings();
  useScrollToHash(!manualState.loading && !manualState.error);
  const channelsById = useMemo(
    () => new Map((channelsState.channels ?? []).map((channel) => [channel.id, channel])),
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

  // «Каналы» и «Шаблоны» видны всегда: им не нужен журнал, а ждать его ради
  // входа в настройки незачем. «Новая рассылка» — после загрузки, как раньше.
  const actions: ScreenAction[] = [
    { label: 'Каналы', onClick: () => void navigate(CHANNELS_PATH) },
    { label: 'Шаблоны', onClick: () => void navigate(TEMPLATES_PATH) },
  ];
  if (!loading) {
    actions.push({
      label: 'Новая рассылка',
      onClick: () => void navigate(`${BROADCASTS_PATH}/new`),
      variant: 'primary',
    });
  }

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        action={<ScreenActions actions={actions} />}
      />
      <BroadcastsSummary />
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
          <ul style={oneCardListStyle}>
            {broadcastsState.broadcasts.map((broadcast, index, all) => (
              <BroadcastCard
                key={broadcast.id}
                broadcast={broadcast}
                channelsById={channelsById}
                onCancel={broadcastsState.cancel}
                onDeliverySent={handleDeliverySent}
                schoolTz={settingsState.settings?.tz}
                isLast={index === all.length - 1}
              />
            ))}
          </ul>
        )}
    </section>
  );
}
