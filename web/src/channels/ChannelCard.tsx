// Строка канала в списке — тип и название, под ними адрес и «Выключен», если
// канал выключен. <button>, не <div onClick> (CLAUDE.md «Доступность»), стиль —
// общий components/listCardStyles.ts. Переключатель `active` и «Проверить»
// стояли прямо здесь; оба переехали на страницу канала (ADR-0033, макет
// Main.dc.html): три интерактивных элемента в строке ломали её как список, а
// тест уходит в живой канал — такое нажимают осознанно, а не мимоходом.
//
// webpush создаётся push-подпиской, не этой формой (channelFormInput.ts) —
// его строка не ведёт на страницу правки (ревью п.14).
import type { CSSProperties, ReactNode } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { CHANNEL_TYPE_LABELS_RU } from './channelTypeLabels';

const OFF_LABEL = 'Выключен';
const NO_TARGET = '—';

const readOnlyStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };

interface ChannelCardProps {
  channel: ChannelDto;
  onSelect: () => void;
}

export function ChannelCard({ channel, onSelect }: ChannelCardProps) {
  const openable = channel.type !== 'webpush';
  const content: ReactNode = (
    <>
      <div style={listCardTitleStyle}>
        {CHANNEL_TYPE_LABELS_RU[channel.type]} · {channel.title}
      </div>
      <div style={listCardMetaStyle}>
        {channel.target || NO_TARGET}
        {!channel.active && ` · ${OFF_LABEL}`}
      </div>
    </>
  );

  return (
    <li>
      {openable ? (
        <button type="button" style={listCardStyle} onClick={onSelect}>
          {content}
        </button>
      ) : (
        <div style={readOnlyStyle}>{content}</div>
      )}
    </li>
  );
}
