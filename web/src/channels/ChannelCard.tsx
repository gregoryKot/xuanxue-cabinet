// Строка канала в списке — тип и название, под ними адрес и «Выключен», если
// канал выключен. Список каналов теперь одна карточка (обёртка —
// ChannelsScreen.tsx): пять карточек вплотную давали зазубренные углы и швы
// между ними (тот же отзыв владельца, что и по «Вопросам», docs/adr/0043) —
// строка больше не несёт свой фон, радиус и тень, только паддинг и волосяную
// линию снизу, тот же приём, что у ExamCard.tsx; у последней строки линии
// нет. <button>, не <div onClick> (CLAUDE.md «Доступность»). Переключатель
// `active` и «Проверить» стояли прямо здесь; оба переехали на страницу
// канала (ADR-0033, макет Main.dc.html): три интерактивных элемента в строке
// ломали её как список, а тест уходит в живой канал — такое нажимают
// осознанно, а не мимоходом.
//
// webpush создаётся push-подпиской, не этой формой (channelFormInput.ts) —
// его строка не ведёт на страницу правки (ревью п.14): вместо <button> —
// немая <div> той же геометрии строки, курсор `default`.
import type { CSSProperties, ReactNode } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { CHANNEL_TYPE_LABELS_RU } from './channelTypeLabels';

const OFF_LABEL = 'Выключен';
const NO_TARGET = '—';

// `<button>` приносит свою рамку и фон — без явного сброса строка выглядела
// бы обведённой поверх общей карточки списка (тот же баг, что и до
// ADR-0031, снимок редактора 2026-09-15, components/listCardStyles.ts).
const rowButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  padding: '16px 20px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
const readOnlyStyle: CSSProperties = { ...rowButtonStyle, cursor: 'default' };

interface ChannelCardProps {
  channel: ChannelDto;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (ChannelsScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function ChannelCard({ channel, onSelect, isLast = false }: ChannelCardProps) {
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
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      {openable ? (
        <button type="button" style={rowButtonStyle} onClick={onSelect}>
          {content}
        </button>
      ) : (
        <div style={readOnlyStyle}>{content}</div>
      )}
    </li>
  );
}
