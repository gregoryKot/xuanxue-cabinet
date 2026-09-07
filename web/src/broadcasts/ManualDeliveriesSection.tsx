// Блок «Ждут отправки вручную» вверху журнала (docs/PLAN.md §6 «Рассылки») —
// `id="manual"`: якорь для ссылки со «Сводки» (SummaryScreen.tsx). Пусто —
// секции нет вовсе, а не пустой заголовок (CLAUDE.md «Продукт»). Данные —
// пропсом из BroadcastsScreen (`useManualDeliveries()` поднят туда,
// pr-k3-fixes.md п.7): экран сам знает, когда список точно отрисован
// (`!loading && !error`), чтобы включить `useScrollToHash` для `#manual`.
import type { CSSProperties } from 'react';
import type { ChannelDto, DeliveryDto } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonList } from '../components/Skeleton';
import { DeliveryCard } from './DeliveryCard';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

interface ManualDeliveriesSectionProps {
  deliveries: DeliveryDto[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  channelsById: Map<string, ChannelDto>;
  /** Композитный onSent родителя (pr-k3-fixes.md п.8) — перечитывает и этот
   * список, и журнал рассылок. */
  onSent: () => Promise<void>;
}

export function ManualDeliveriesSection({
  deliveries,
  loading,
  error,
  onRetry,
  channelsById,
  onSent,
}: ManualDeliveriesSectionProps) {
  if (loading) return <SkeletonList rows={2} h={64} />;
  if (error) return <LoadErrorBanner message={error} onRetry={onRetry} />;
  if (!deliveries || deliveries.length === 0) return null;

  return (
    <section id="manual" style={sectionStyle}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Ждут отправки вручную</h2>
      <ul style={listStyle}>
        {deliveries.map((delivery) => (
          <DeliveryCard
            key={delivery.id}
            delivery={delivery}
            channelName={channelsById.get(delivery.channelId)?.title ?? '—'}
            channelType={channelsById.get(delivery.channelId)?.type}
            onSent={onSent}
          />
        ))}
      </ul>
    </section>
  );
}
