// Строка рассылки в журнале — время и статус в одну линию, ниже текст поста;
// раскрывается в список доставок (CLAUDE.md «Одна механика — один
// компонент»). Журнал теперь одна карточка (обёртка в BroadcastsScreen.tsx,
// `--radius-block`, `overflow: hidden`), строки разделяет волосяная линия
// `--panel`, не своя карточка на строку (listCardStyles сюда не подходит,
// docs/adr/0043). Действия строки — BroadcastCardActions.tsx: вынесены,
// чтобы строка не пересекла порог 150 строк (CLAUDE.md «Храповики»).
import { useState, type CSSProperties } from 'react';
import type { BroadcastDto, ChannelDto } from '@xuanxue/shared';
import { formatDateTime } from '../lib/formatDate';
import { tzBadge } from '../schedule/timezoneLabel';
import {
  BROADCAST_KIND_LABELS_RU,
  BROADCAST_STATUS_COLOR,
  BROADCAST_STATUS_LABELS_RU,
} from './broadcastLabels';
import { BroadcastCardActions } from './BroadcastCardActions';
import { BroadcastDeliveriesList } from './BroadcastDeliveriesList';
import { firstLines } from './firstLines';

const PREVIEW_LINES = 2;
// Отступ раскрытого списка доставок от кнопок. В свёрнутом виде обёртка
// пустая и отступа не получает — иначе внизу строки висел бы лишний зазор.
const DELIVERIES_GAP_PX = 12;

// Ритм строки задают отступы самих блоков, а не один общий `gap`. Раньше
// стоял `gap: 6` на всё сразу, и четыре разнородных блока — мета, превью
// поста, кнопки и обёртка доставок — шли с одинаковым зазором: журнал
// читался сплошной кашей («в рассылках расстояния нет», отзыв владельца
// 2026-09-19). Плюс обёртка доставок рендерится ВСЕГДА (ниже объяснено,
// почему), и в свёрнутом виде пустой узел съедал ещё один зазор внизу
// строки. С `gap: 0` пустая обёртка не стоит ничего, а каждый блок сам
// говорит, насколько он отодвинут от предыдущего.
const rowBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 20px',
};
const topLineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 16,
};
const timeStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--ink)',
};
const previewStyle: CSSProperties = {
  // Превью — продолжение строки меты, держим близко.
  margin: '6px 0 0',
  fontSize: 14,
  lineHeight: 1.55,
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
  /** Последняя строка журнала — без нижней волосяной линии, иначе у карточки-
   * обёртки под линией остаётся голая полоска фона (docs/adr/0043). */
  isLast?: boolean;
}

export function BroadcastCard({
  broadcast,
  channelsById,
  onCancel,
  onDeliverySent,
  schoolTz,
  isLast = false,
}: BroadcastCardProps) {
  const [expanded, setExpanded] = useState(false);
  const canCancel = broadcast.status === 'scheduled';
  const deliveriesId = `broadcast-deliveries-${broadcast.id}`;
  const badge = schoolTz ? tzBadge(schoolTz) : null;

  return (
    <li
      style={{
        ...rowBaseStyle,
        borderBottom: isLast ? 'none' : '1px solid var(--panel)',
      }}
    >
      <div style={topLineStyle}>
        <span style={timeStyle}>{formatDateTime(broadcast.scheduledAt)}</span>
        <span style={{ fontSize: 13, color: BROADCAST_STATUS_COLOR[broadcast.status] }}>
          {badge && `${badge} · `}
          {BROADCAST_KIND_LABELS_RU[broadcast.kind]} ·{' '}
          {BROADCAST_STATUS_LABELS_RU[broadcast.status]}
        </span>
      </div>
      <p style={previewStyle}>{firstLines(broadcast.text, PREVIEW_LINES)}</p>

      <BroadcastCardActions
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        deliveriesId={deliveriesId}
        canCancel={canCancel}
        onCancel={() => onCancel(broadcast.id)}
      />

      {/* Обёртка рендерится всегда — `aria-controls` должен указывать на
          существующий в DOM элемент, даже когда список ещё свёрнут. */}
      <div id={deliveriesId} style={{ marginTop: expanded ? DELIVERIES_GAP_PX : 0 }}>
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
    </li>
  );
}
