// Строка рассылки в журнале — время антиквой, под ним вид и статус, первые
// строки текста; раскрывается в список доставок (CLAUDE.md «Одна механика —
// один компонент»). Облик — направление «тихо и благородно» (docs/adr/0031):
// волосяная линия вместо рамки-карточки, статус растяжкой-заглавными
// (`.xuanxue-status-label`), а не «пилюлей».
//
// Не `<button>` целиком, как строка канала или вопроса: внутри свои кнопки
// («Раскрыть», «Отменить»), вложенные кнопки невалидны (CLAUDE.md
// «Доступность») — отсюда общий listRowStyle, а не listCardStyle.
//
// Действия строки — текстовыми кнопками (components/TextLinkButton.tsx):
// киноварь на экране одна, у «Новой рассылки», а обведённые кнопки в каждой
// строке превращали журнал в стопку панелей (отзыв владельца 2026-09-16).
// Отмена — через ConfirmDialog, как удаление канала: у рассылки нет пути
// назад после отправки.
import { useState, type CSSProperties } from 'react';
import type { BroadcastDto, ChannelDto } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorFrom } from '../components/FormServerError';
import {
  listCardMetaStyle,
  listCardTitleStyle,
  listRowStyle,
} from '../components/listCardStyles';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { formatDateTime } from '../lib/formatDate';
import { tzBadge } from '../schedule/timezoneLabel';
import { BROADCAST_KIND_LABELS_RU, BROADCAST_STATUS_LABELS_RU } from './broadcastLabels';
import { BroadcastDeliveriesList } from './BroadcastDeliveriesList';
import { firstLines } from './firstLines';

const CANCEL_ERROR = 'Не удалось отменить рассылку. Попробуйте ещё раз.';
const CANCEL_MESSAGE =
  'Рассылка не уйдёт ни в один канал. Вернуть её потом не получится.';

const PREVIEW_LINES = 2;

const rowStyle: CSSProperties = {
  ...listRowStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const previewStyle: CSSProperties = { ...noteStyle, whiteSpace: 'pre-wrap' };
const actionsStyle: CSSProperties = { display: 'flex', gap: 24, flexWrap: 'wrap' };

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
    <li style={rowStyle}>
      <div style={listCardTitleStyle}>{formatDateTime(broadcast.scheduledAt)}</div>
      <div style={listCardMetaStyle}>
        {badge && `${badge} · `}
        {BROADCAST_KIND_LABELS_RU[broadcast.kind]} ·{' '}
        <span className="xuanxue-status-label">
          {BROADCAST_STATUS_LABELS_RU[broadcast.status]}
        </span>
      </div>
      <p style={previewStyle}>{firstLines(broadcast.text, PREVIEW_LINES)}</p>
      {cancelError && (
        <p role="alert" style={dangerNoteStyle}>
          {cancelError}
        </p>
      )}

      <div style={actionsStyle}>
        <TextLinkButton
          aria-expanded={expanded}
          aria-controls={deliveriesId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Свернуть' : 'Раскрыть'}
        </TextLinkButton>
        {canCancel && (
          <TextLinkButton danger onClick={() => setConfirmingCancel(true)}>
            Отменить
          </TextLinkButton>
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
