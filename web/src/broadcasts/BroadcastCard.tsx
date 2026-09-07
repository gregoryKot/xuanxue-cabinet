// Карточка рассылки в журнале — время, вид, статус, первые строки текста;
// раскрывается в список доставок (CLAUDE.md «Одна механика — один
// компонент»). Отмена — через ConfirmDialog, как удаление канала/отмена
// занятия: у рассылки нет пути назад после отправки.
import { useState, type CSSProperties } from 'react';
import type { BroadcastDto, ChannelDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorFrom } from '../components/FormServerError';
import { formatDateTime } from '../lib/formatDate';
import { tzBadge } from '../schedule/timezoneLabel';
import { BROADCAST_KIND_LABELS_RU, BROADCAST_STATUS_LABELS_RU } from './broadcastLabels';
import { BroadcastDeliveriesList } from './BroadcastDeliveriesList';
import { firstLines } from './firstLines';

const CANCEL_ERROR = 'Не удалось отменить рассылку. Попробуйте ещё раз.';
const CANCEL_MESSAGE = 'Рассылка не уйдёт ни в один канал. Действие необратимо.';

const PREVIEW_LINES = 2;

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
};
const titleStyle: CSSProperties = { fontWeight: 600, fontSize: 14 };
const previewStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
  whiteSpace: 'pre-wrap',
};

interface BroadcastCardProps {
  broadcast: BroadcastDto;
  channelsById: Map<string, ChannelDto>;
  onCancel: (id: string) => Promise<void>;
  /** Читает журнал заново после «Отметить отправленным» у одной из доставок
   * (композитный onSent, pr-k3-fixes.md п.8) — статус рассылки в журнале
   * должен обновиться сразу, не только список доставок под карточкой. */
  onDeliverySent: () => Promise<void>;
  /** Пояс школы (`SettingsDto.tz`) — бейдж рядом со временем, только если
   * отличается от браузерного; `undefined`, если настройки не загрузились —
   * бейдж просто не показывается (pr-k3-fixes.md п.22). */
  schoolTz?: string;
}

export function BroadcastCard({
  broadcast,
  channelsById,
  onCancel,
  onDeliverySent,
  schoolTz,
}: BroadcastCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const canCancel = broadcast.status === 'scheduled';
  const deliveriesId = `broadcast-deliveries-${broadcast.id}`;
  const badge = schoolTz ? tzBadge(schoolTz) : null;

  async function handleConfirmCancel() {
    setCancelPending(true);
    setCancelError(null);
    try {
      await onCancel(broadcast.id);
    } catch (err) {
      setCancelError(errorFrom(err, CANCEL_ERROR).message);
    } finally {
      setCancelPending(false);
    }
  }

  return (
    <li style={cardStyle}>
      <div style={titleStyle}>
        {formatDateTime(broadcast.scheduledAt)}
        {badge && ` · ${badge}`} · {BROADCAST_KIND_LABELS_RU[broadcast.kind]} ·{' '}
        {BROADCAST_STATUS_LABELS_RU[broadcast.status]}
      </div>
      <p style={previewStyle}>{firstLines(broadcast.text, PREVIEW_LINES)}</p>
      {cancelError && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
          {cancelError}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={deliveriesId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Свернуть' : 'Раскрыть'}
        </Button>
        {canCancel && (
          <Button
            type="button"
            variant="danger"
            onClick={() => setConfirmingCancel(true)}
          >
            Отменить
          </Button>
        )}
      </div>

      {/* Обёртка рендерится всегда — `aria-controls` должен указывать на
          существующий в DOM элемент, даже когда список ещё свёрнут. */}
      <div id={deliveriesId}>
        {expanded && (
          <BroadcastDeliveriesList
            broadcastId={broadcast.id}
            broadcast={broadcast}
            channelsById={channelsById}
            onDeliverySent={onDeliverySent}
            schoolTz={schoolTz}
          />
        )}
      </div>

      {confirmingCancel && (
        <ConfirmDialog
          title="Отменить рассылку?"
          message={CANCEL_MESSAGE}
          confirmLabel="Отменить рассылку"
          pending={cancelPending}
          onConfirm={handleConfirmCancel}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </li>
  );
}
