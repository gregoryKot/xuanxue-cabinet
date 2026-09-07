// Доставки раскрытой рассылки — монтируется только когда карточка раскрыта
// (BroadcastCard), сам себя грузит через useBroadcastDeliveries. «Отметить
// отправленным» перечитывает и этот список, и журнал рассылок родителя
// (композитный onSent, pr-k3-fixes.md п.8) — статус самой рассылки в журнале
// меняется, когда закрылась последняя доставка.
import type { CSSProperties } from 'react';
import type { BroadcastDto, ChannelDto } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonList } from '../components/Skeleton';
import { DeliveryCard } from './DeliveryCard';
import { useBroadcastDeliveries } from './useBroadcastDeliveries';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

interface BroadcastDeliveriesListProps {
  broadcastId: string;
  broadcast: BroadcastDto;
  channelsById: Map<string, ChannelDto>;
  onDeliverySent: () => Promise<void>;
  /** Пояс школы — прокидывается дальше в DeliveryCard (pr-k3-fixes.md п.22). */
  schoolTz?: string;
}

export function BroadcastDeliveriesList({
  broadcastId,
  broadcast,
  channelsById,
  onDeliverySent,
  schoolTz,
}: BroadcastDeliveriesListProps) {
  const { deliveries, loading, error, reload } = useBroadcastDeliveries(broadcastId);

  async function handleSent() {
    await reload();
    await onDeliverySent();
  }

  if (loading) return <SkeletonList rows={2} h={48} />;
  if (error) return <LoadErrorBanner message={error} onRetry={() => void reload()} />;
  if (!deliveries || deliveries.length === 0) {
    return <p style={{ margin: 0, fontSize: 13 }}>Доставок пока нет.</p>;
  }

  return (
    <ul style={listStyle}>
      {deliveries.map((delivery) => (
        <DeliveryCard
          key={delivery.id}
          delivery={delivery}
          channelName={channelsById.get(delivery.channelId)?.title ?? '—'}
          channelType={channelsById.get(delivery.channelId)?.type}
          broadcast={broadcast}
          schoolTz={schoolTz}
          onSent={handleSent}
        />
      ))}
    </ul>
  );
}
