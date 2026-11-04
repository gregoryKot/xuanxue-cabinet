// Строка канала в списке — тип и название, под ними адрес. Список каналов теперь одна карточка (обёртка —
// ChannelsScreen.tsx): пять карточек вплотную давали зазубренные углы и швы
// между ними (тот же отзыв владельца, что и по «Вопросам», docs/adr/0043) —
// строка больше не несёт свой фон, радиус и тень, только паддинг и волосяную
// линию снизу, тот же приём, что у ExamCard.tsx; у последней строки линии
// нет. <button>, не <div onClick> (CLAUDE.md «Доступность»). «Проверить» стояло прямо здесь; оба переехали на страницу
// канала (ADR-0033, макет Main.dc.html): два интерактивных элемента в строке
// ломали её как список, а тест уходит в живой канал — такое нажимают
// осознанно, а не мимоходом.
import type { CSSProperties, ReactNode } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { Skeleton } from '../components/Skeleton';
import type { ChannelGroupLine } from './channelGroupText';
import { CHANNEL_TYPE_LABELS_RU } from './channelTypeLabels';

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
  /** Строка группы канала (formatChannelGroup, ADR-0195). `null` — ещё грузится
   * (скелетон, не «группа не выбрана»); не передано — строки нет (группы или
   * занятия не загрузились, лучше молчать, чем соврать). */
  groupLine?: ChannelGroupLine | null;
}

export function ChannelCard({
  channel,
  onSelect,
  isLast = false,
  groupLine,
}: ChannelCardProps) {
  const content: ReactNode = (
    <>
      <div style={listCardTitleStyle}>
        {CHANNEL_TYPE_LABELS_RU[channel.type]} · {channel.title}
      </div>
      <div style={listCardMetaStyle}>{channel.target || NO_TARGET}</div>
      <GroupLine line={groupLine} />
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

function GroupLine({ line }: { line: ChannelGroupLine | null | undefined }) {
  if (line === undefined) return null;
  if (line === null) return <Skeleton w="60%" h={13} style={{ marginTop: 6 }} />;
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
