// Строка канала в списке — тип и название, под ними адрес, «Выключен», если
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
import type { CSSProperties, ReactNode } from 'react';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { Skeleton } from '../components/Skeleton';
import { formatChannelClasses } from './channelClassesText';
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

interface ChannelCardProps {
  channel: ChannelDto;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (ChannelsScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
  /** Занятия школы: по ним строка говорит, какие из них шлют сюда посты.
   * `null` — ещё грузятся (скелетон, не «ни одного»); не передано — строки
   * нет (занятия не загрузились, лучше молчать, чем соврать). */
  classes?: ClassDto[] | null;
}

export function ChannelCard({
  channel,
  onSelect,
  isLast = false,
  classes,
}: ChannelCardProps) {
  const content: ReactNode = (
    <>
      <div style={listCardTitleStyle}>
        {CHANNEL_TYPE_LABELS_RU[channel.type]} · {channel.title}
      </div>
      <div style={listCardMetaStyle}>
        {channel.target || NO_TARGET}
        {!channel.active && ` · ${OFF_LABEL}`}
      </div>
      <ClassesLine channelId={channel.id} classes={classes} />
    </>
  );

  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <button type="button" style={rowButtonStyle} onClick={onSelect}>
        {content}
      </button>
    </li>
  );
}

function ClassesLine({
  channelId,
  classes,
}: {
  channelId: string;
  classes: ClassDto[] | null | undefined;
}) {
  if (classes === undefined) return null;
  if (classes === null) return <Skeleton w="60%" h={13} style={{ marginTop: 6 }} />;
  const line = formatChannelClasses(channelId, classes);
  return (
    <div
      style={{
        ...listCardMetaStyle,
        color: line.isWarning ? 'var(--danger)' : 'var(--ink-soft)',
      }}
    >
      <RichText text={line.text} />
    </div>
  );
}
