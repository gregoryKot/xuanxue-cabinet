// Список каналов чекбоксами — одна механика на кабинет (CLAUDE.md «Одна
// механика — один компонент», pr-k3-fixes.md п.9): раньше та же разметка
// дублировалась в schedule/ClassChannelsField.tsx (лист занятия) и
// broadcasts/BroadcastFormFields.tsx (лист рассылки) — jscpd поймал бы
// дубль. `emptyMessage` — у пустого списка разный смысл в разных местах
// («каналов нет вовсе» у занятия, «нет включённых» у рассылки), поэтому
// текст передаёт вызывающий компонент, а не общий. `ref` — на сам `fieldset`
// (`tabIndex={-1}`): форма рассылки фокусирует его при ошибке «выберите
// канал» (pr-k3-fixes.md п.6, broadcastFormInput.ts).
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { CHANNEL_TYPE_LABELS_RU } from './channelTypeLabels';

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
const errorStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
};

interface ChannelPickerProps {
  legend: string;
  channels: ChannelDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  hint?: ReactNode;
  emptyMessage: ReactNode;
  error?: string;
}

export const ChannelPicker = forwardRef<HTMLFieldSetElement, ChannelPickerProps>(
  function ChannelPicker(
    { legend, channels, selectedIds, onChange, hint, emptyMessage, error },
    ref,
  ) {
    function toggle(id: string, checked: boolean) {
      onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));
    }

    return (
      <fieldset ref={ref} tabIndex={-1} style={fieldsetStyle}>
        <legend style={legendStyle}>{legend}</legend>
        {hint}

        {channels.length === 0 ? (
          <p style={hintStyle}>{emptyMessage}</p>
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
        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
      </fieldset>
    );
  },
);
