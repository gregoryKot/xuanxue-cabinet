// Строка одной записи в центре уведомлений (ADR-0063), обёрнута в SwipeRow —
// смахнуть/кнопка «Убрать» (просьба владельца 2026-09-22). У вида с адресом
// (notificationTarget.ts, ADR-0070) строка — ссылка на свой предмет: у
// непрочитанной клик метит её прочитанной и переходит (onClick зовёт onRead,
// переход делает сам `<Link>`), у прочитанной — просто ссылка. У вида без
// адреса всё как раньше: непрочитанная — кнопка на всю ширину, прочитанная —
// обычный `<div>` без кнопки — нажимать уже не на что, а `<button>`/ссылка,
// которые никуда не ведут, обманывают и палец, и клавиатуру (CLAUDE.md
// «Доступность»).
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationDto } from '@xuanxue/shared';
import { SwipeRow } from '../components/SwipeRow';
import { describeOutcome } from '../student/examAttemptState';
import { isUnread, notificationTimeText } from './notificationFeed';
import { notificationTarget } from './notificationTarget';

interface NotificationRowProps {
  item: NotificationDto;
  nowIso: string;
  /** Последняя в своей карточке — не красит линию снизу. */
  isLast: boolean;
  onRead: () => void;
  onDismiss: () => void;
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  width: '100%',
  minHeight: 44,
  padding: '14px 18px',
  textAlign: 'left',
  font: 'inherit',
  color: 'var(--ink)',
};
const rowButtonStyle: CSSProperties = {
  ...rowStyle,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};
// Ссылка — тот же ряд, только без подчёркивания браузера по умолчанию; цель
// нажатия 44 px уже держит `rowStyle.minHeight`.
const rowLinkStyle: CSSProperties = { ...rowStyle, textDecoration: 'none' };

// Место под точку занято всегда, у прочитанной строки тоже (фон становится
// прозрачным) — иначе текст прыгает влево в момент, когда строку пометили
// прочитанной.
const dotStyle: CSSProperties = {
  width: 7,
  height: 7,
  marginTop: 6,
  flexShrink: 0,
  borderRadius: 'var(--radius-pill)',
};
const textColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};
// Строки внутри — `<span>`, не `<p>`: у непрочитанной записи обёртка —
// `<button>` или `<Link>` (рендерится как `<a>`), а оба по спецификации
// принимают только phrasing content — абзац внутри был бы невалиден. Блоками
// они всё равно встают: дети flex-контейнера блокируются независимо от
// своего `display`.
const textStyle: CSSProperties = { color: 'var(--ink)' };
const timeStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Итог красится нефритом только при «сдал» — единственный смысл, за которым
// этот цвет закреплён (docs/adr/0031, тот же приём, что ExamAttemptOutcome.tsx).
const outcomeStyle: CSSProperties = { color: 'var(--ink)' };
const passedOutcomeStyle: CSSProperties = { ...outcomeStyle, color: 'var(--jade)' };

// Первый узел кнопки/ссылки — точка непрочитанного скринридеру не видна, её
// цвет ничего не говорит без слов.
function unreadLabel(unread: boolean): ReactNode {
  return unread ? <span className="xuanxue-sr-only">Не прочитано</span> : null;
}

export function NotificationRow({
  item,
  nowIso,
  isLast,
  onRead,
  onDismiss,
}: NotificationRowProps) {
  const unread = isUnread(item);
  const target = notificationTarget(item);

  const body = (
    <>
      <span
        aria-hidden="true"
        style={{ ...dotStyle, background: unread ? 'var(--terracotta)' : 'transparent' }}
      />
      <span style={textColumnStyle}>
        <span style={textStyle}>{item.text}</span>
        {item.outcome && (
          <span
            className="xuanxue-status-label"
            style={item.outcome === 'passed' ? passedOutcomeStyle : outcomeStyle}
          >
            {describeOutcome(item.outcome)}
          </span>
        )}
        <span style={timeStyle}>{notificationTimeText(item.createdAt, nowIso)}</span>
      </span>
    </>
  );

  let content: ReactNode;
  if (target) {
    content = (
      <Link to={target} onClick={unread ? onRead : undefined} style={rowLinkStyle}>
        {unreadLabel(unread)}
        {body}
      </Link>
    );
  } else if (unread) {
    content = (
      <button type="button" onClick={onRead} style={rowButtonStyle}>
        {unreadLabel(unread)}
        {body}
      </button>
    );
  } else {
    content = <div style={rowStyle}>{body}</div>;
  }

  return (
    <SwipeRow
      isLast={isLast}
      onDismiss={onDismiss}
      dismissLabel={`Убрать уведомление: ${item.text}`}
    >
      {content}
    </SwipeRow>
  );
}
