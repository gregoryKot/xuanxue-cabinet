// Карточка канала — тип/название/target, выключатель active (мутация сразу,
// без листа) и «Проверить» (CLAUDE.md «Одна механика — один компонент»).
// Не одна <button>: внутри — переключатель и вторая кнопка, вложенные
// интерактивные элементы в один <button> невалидны (CLAUDE.md «Доступность»).
// webpush создаётся push-подпиской, не этой формой (channelFormInput.ts) —
// карточка такого канала не открывает лист правки (ревью п.14).
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { Button } from '../components/Button';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { Toggle } from '../components/Toggle';
import { CHANNEL_TYPE_LABELS_RU } from './channelTypeLabels';
import { formatChannelTestResult } from './formatChannelTestResult';
import { useChannelTest } from './useChannelTest';

const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить канал. Попробуйте ещё раз.';

const cardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const readOnlyStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

interface ChannelCardProps {
  channel: ChannelDto;
  onSelect: () => void;
  onToggleActive: (active: boolean) => Promise<void>;
}

export function ChannelCard({ channel, onSelect, onToggleActive }: ChannelCardProps) {
  const test = useChannelTest(channel.id, channel.updatedAt);
  const [togglePending, setTogglePending] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const openable = channel.type !== 'webpush';

  async function handleToggle(active: boolean) {
    setTogglePending(true);
    setToggleError(null);
    try {
      await onToggleActive(active);
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : TOGGLE_ERROR_MESSAGE);
    } finally {
      setTogglePending(false);
    }
  }

  const header: ReactNode = (
    <>
      <div style={listCardTitleStyle}>
        {CHANNEL_TYPE_LABELS_RU[channel.type]} · {channel.title}
      </div>
      <div style={listCardMetaStyle}>{channel.target || '—'}</div>
    </>
  );

  return (
    <li style={cardStyle}>
      {openable ? (
        <button type="button" style={listCardStyle} onClick={onSelect}>
          {header}
        </button>
      ) : (
        <div style={readOnlyStyle}>{header}</div>
      )}

      <div style={actionsRowStyle}>
        <Toggle
          label={`Включён — ${channel.title}`}
          checked={channel.active}
          disabled={togglePending}
          onChange={(active) => void handleToggle(active)}
        />
        <Button
          type="button"
          variant="secondary"
          pending={test.pending}
          onClick={() => void test.test()}
        >
          Проверить
        </Button>
      </div>

      {toggleError && (
        <p style={alertTextStyle} role="alert">
          {toggleError}
        </p>
      )}

      {test.result && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: test.result.status === 'failed' ? 'var(--danger)' : undefined,
          }}
          role={test.result.status === 'failed' ? 'alert' : 'status'}
        >
          {formatChannelTestResult(test.result)}
        </p>
      )}
      {test.error && (
        <p style={alertTextStyle} role="alert">
          {test.error}
        </p>
      )}
    </li>
  );
}
