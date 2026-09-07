// Карточка одной доставки — статус, попытки, ошибка; у ручного канала ещё
// текст поста, «Скопировать» и «Отметить отправленным» (docs/PLAN.md §6
// «Доставка»). Один компонент для «Ждут отправки вручную» и раскрытой
// рассылки (CLAUDE.md «Одна механика — один компонент»). «Ручная ли» решает
// `channelType === 'manual'`, не наличие `text` — список доставок его не
// присылает никогда (pr-k3-fixes.md п.3): текст догружается useDeliveryText
// при первом раскрытии текста или клике «Скопировать».
import { useState, type CSSProperties } from 'react';
import type {
  BroadcastDto,
  ChannelType,
  DeliveryDto,
  DeliveryStatus,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { PostPreview } from '../components/PostPreview';
import { formatDateTime } from '../lib/formatDate';
import { tzBadge } from '../schedule/timezoneLabel';
import { BROADCAST_KIND_LABELS_RU, DELIVERY_STATUS_LABELS_RU } from './broadcastLabels';
import { useCopyText } from './useCopyText';
import { useDeliveryText } from './useDeliveryText';
import { useMarkSent } from './useMarkSent';

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
};
const titleStyle: CSSProperties = { fontWeight: 600, fontSize: 14 };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };

// Кнопка «Отметить отправленным» имеет смысл, только пока доставка ещё не
// закрыта — sent/failed/cancelled уже финальны (docs/PLAN.md §6 «Доставка»).
const MARKABLE_STATUSES = new Set<DeliveryStatus>(['pending', 'manual']);

interface DeliveryCardProps {
  delivery: DeliveryDto;
  channelName: string;
  /** `undefined` — канал не нашёлся в загруженном списке, карточка ведёт
   * себя как для не-ручного канала (текста и кнопок нет). */
  channelType: ChannelType | undefined;
  /** Время и вид рассылки — контекст у карточки ручной доставки без своего
   * заголовка рассылки рядом (ManualDeliveriesSection); необязателен — если
   * рассылка уже видна снаружи (BroadcastCard), можно не передавать. */
  broadcast?: BroadcastDto;
  /** Пояс школы — бейдж рядом со временем рассылки, только если `broadcast`
   * передан (pr-k3-fixes.md п.22); `undefined`, если настройки не
   * загрузились — бейдж просто не показывается. */
  schoolTz?: string;
  onSent: () => Promise<void>;
}

export function DeliveryCard({
  delivery,
  channelName,
  channelType,
  broadcast,
  schoolTz,
  onSent,
}: DeliveryCardProps) {
  const mark = useMarkSent(onSent);
  const copyState = useCopyText();
  const deliveryText = useDeliveryText(delivery.id);
  const [revealed, setRevealed] = useState(false);
  const isManual = channelType === 'manual';
  const badge = schoolTz ? tzBadge(schoolTz) : null;
  const canMarkSent = isManual && MARKABLE_STATUSES.has(delivery.status);
  const showAttempts = delivery.attempts > 1 || !!delivery.error;

  async function handleReveal() {
    if (!revealed) await deliveryText.ensureLoaded();
    setRevealed((v) => !v);
  }

  async function handleCopy() {
    const text = deliveryText.text ?? (await deliveryText.ensureLoaded());
    if (text !== undefined) await copyState.copy(text);
  }

  return (
    <li style={cardStyle}>
      <div style={titleStyle}>
        {channelName} · {DELIVERY_STATUS_LABELS_RU[delivery.status]}
      </div>
      {isManual && broadcast && (
        <div style={metaStyle}>
          {formatDateTime(broadcast.scheduledAt)}
          {badge && ` · ${badge}`} · {BROADCAST_KIND_LABELS_RU[broadcast.kind]}
        </div>
      )}
      {showAttempts && (
        <div style={metaStyle}>
          Попыток: {delivery.attempts}
          {delivery.error && ` · ${delivery.error}`}
        </div>
      )}

      {isManual && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={revealed}
              pending={deliveryText.loading}
              onClick={() => void handleReveal()}
            >
              {revealed ? 'Скрыть текст' : 'Показать текст'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
              {copyState.copied ? 'Скопировано' : 'Скопировать'}
            </Button>
            {canMarkSent && (
              <Button
                type="button"
                pending={mark.pending}
                onClick={() => void mark.markSent(delivery.id)}
              >
                Отметить отправленным
              </Button>
            )}
          </div>

          {revealed && deliveryText.text !== undefined && (
            <PostPreview text={deliveryText.text} />
          )}
          {(deliveryText.error || copyState.error) && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
              {deliveryText.error ?? copyState.error}
            </p>
          )}
          {mark.error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
              {mark.error}
            </p>
          )}
        </>
      )}
    </li>
  );
}
