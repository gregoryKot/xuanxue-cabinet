// «Каналы» — куда уходят посты (docs/PLAN.md §6 п.4). Telegram подключается
// сам через бота, здесь добавляют ВК и ручные каналы (CLAUDE.md «Каждая
// фича объясняет откуда это и зачем»). Скелетон — только пока список ни разу
// не пришёл (`channels === null`): перечитывание после мутации (переключатель,
// сохранение листа) не прячет список и не сбрасывает фокус (ревью п.10).
import { useState, type CSSProperties } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenExplanationStyle,
  screenSectionStyle,
} from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { ChannelCard } from './ChannelCard';
import { ChannelSheet } from './ChannelSheet';
import { useChannels } from './useChannels';

const EXPLANATION =
  'Каналы — куда уходят ссылки и записи. Telegram-группа подключается сама: добавьте бота в группу. ВК и ручные каналы добавьте здесь.';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

export default function ChannelsScreen() {
  const { channels, loading, error, reload, create, update, remove } = useChannels();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetChannelId, setSheetChannelId] = useState<string | null>(null);

  const selectedChannel: ChannelDto | null =
    channels?.find((channel) => channel.id === sheetChannelId) ?? null;

  function openCreate() {
    setSheetChannelId(null);
    setSheetOpen(true);
  }

  function openEdit(channelId: string) {
    setSheetChannelId(channelId);
    setSheetOpen(true);
  }

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {channels !== null && (
        <Button style={primaryActionStyle} onClick={openCreate}>
          Добавить канал
        </Button>
      )}

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && channels === null && !error && <SkeletonList rows={4} h={96} />}

      {!error && channels && channels.length === 0 && (
        <p style={{ margin: 0 }}>Пока нет ни одного канала — добавьте первый.</p>
      )}

      {!error && channels && channels.length > 0 && (
        <ul style={listStyle}>
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onSelect={() => openEdit(channel.id)}
              onToggleActive={(active) => update(channel.id, { active })}
            />
          ))}
        </ul>
      )}

      {sheetOpen && (
        <ChannelSheet
          channelDto={selectedChannel}
          onClose={() => setSheetOpen(false)}
          onCreate={create}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </section>
  );
}
