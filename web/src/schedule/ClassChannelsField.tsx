// Секция «Каналы рассылки» в листе занятия — какие каналы получат ссылку и
// запись (docs/PLAN.md §6 п.1, ревью п.1). Каналы грузятся один раз на
// экран «Расписание» (useChannels(true) в ScheduleScreen) и передаются сюда
// готовым списком — лист их не запрашивает сам.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ChannelDto } from '@xuanxue/shared';
import { CHANNEL_TYPE_LABELS_RU } from '../channels/channelTypeLabels';

const EXPLANATION =
  'Сюда уйдут ссылка на занятие и запись. Telegram-группа с ботом подключается ко всем занятиям сама.';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
};

interface ClassChannelsFieldProps {
  channels: ChannelDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ClassChannelsField({
  channels,
  selectedIds,
  onChange,
}: ClassChannelsFieldProps) {
  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));
  }

  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>Каналы рассылки</legend>
      <p style={hintStyle}>{EXPLANATION}</p>

      {channels.length === 0 ? (
        <p style={hintStyle}>
          Каналов пока нет. Добавьте их на экране <Link to="/channels">«Каналы»</Link> —
          потом выберите здесь.
        </p>
      ) : (
        channels.map((channel) => (
          <label key={channel.id} style={rowStyle}>
            <input
              type="checkbox"
              checked={selectedIds.includes(channel.id)}
              onChange={(e) => toggle(channel.id, e.target.checked)}
            />
            <span>
              {CHANNEL_TYPE_LABELS_RU[channel.type]} · {channel.title}
            </span>
          </label>
        ))
      )}
    </fieldset>
  );
}
