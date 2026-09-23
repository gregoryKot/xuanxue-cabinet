// Блок «Ждут отправки вручную» вверху журнала (docs/PLAN.md §6 «Рассылки») —
// `id="manual"`: якорь для внешней ссылки (бот, уведомление учителю), поэтому
// список доставок под плашкой остаётся развёрнутым всегда — ссылка должна
// показать сами доставки, а не ещё один свёрнутый узел. Тёплая плашка сверху
// (docs/adr/0043, --panel-warm) — счётчик и напоминание, зачем это вообще
// нужно; «Открыть» прокручивает к списку под ней (доставок может быть больше,
// чем помещается на экране). Пусто — секции нет вовсе (CLAUDE.md «Продукт»).
// Данные — пропсом из BroadcastsScreen (`useManualDeliveries()` поднят туда,
// pr-k3-fixes.md п.7): экран сам знает, когда список точно отрисован
// (`!loading && !error`), чтобы включить `useScrollToHash` для `#manual`.
import { useRef, type CSSProperties } from 'react';
import type { ChannelDto, DeliveryDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { SkeletonList } from '../components/Skeleton';
import { DeliveryCard } from './DeliveryCard';

// Не «бот не пишет от вашего имени» про конкретный канал (в списке их может
// быть несколько сразу) — общая причина одна для любого ручного канала:
// у бота там нет своего доступа для отправки (docs/PLAN.md §6 «Доставка»).
const MANUAL_HINT =
  'Бот не пишет в такие каналы сам — скопируйте текст и отправьте **от своего имени**.';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const panelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '16px 20px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
};
const panelTitleStyle: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 500 };
// #55584e, не --ink-soft: на --panel-warm (темнее бумаги) --ink-soft держит
// только ~4.06:1 — ниже AA 4.5 для этого кегля. 5.74:1 к --panel-warm.
const panelHintStyle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: 13,
  color: '#55584e',
};
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
  const listRef = useRef<HTMLUListElement>(null);

  if (loading) return <SkeletonList rows={2} h={64} />;
  if (error) return <LoadErrorBanner message={error} onRetry={onRetry} />;
  if (!deliveries || deliveries.length === 0) return null;

  return (
    <section id="manual" style={sectionStyle}>
      <div style={panelStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={panelTitleStyle}>Ждут отправки вручную · {deliveries.length}</h2>
          <p style={panelHintStyle}>
            <RichText text={MANUAL_HINT} />
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          Открыть
        </Button>
      </div>
      <ul ref={listRef} style={listStyle}>
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
