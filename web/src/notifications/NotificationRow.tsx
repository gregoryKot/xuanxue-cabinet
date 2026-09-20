// Строка одной записи в центре уведомлений (ADR-0063). Непрочитанная — кнопка
// на всю ширину: нажатие помечает именно её прочитанной. Прочитанная — обычный
// `<div>` без кнопки: нажимать уже не на что, а `<button>`, который ничего не
// делает, обманывает и палец, и клавиатуру (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import type { NotificationDto } from '@xuanxue/shared';
import { describeOutcome } from '../student/examAttemptState';
import { isUnread, notificationTimeText } from './notificationFeed';

interface NotificationRowProps {
  item: NotificationDto;
  nowIso: string;
  /** Последняя в своей карточке — не красит линию снизу. */
  isLast: boolean;
  onRead: () => void;
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
// Строки внутри — `<span>`, не `<p>`: у непрочитанной записи обёртка это
// `<button>`, а он по спецификации принимает только phrasing content, и абзац
// внутри него — невалидная разметка. Блоками они всё равно встают: дети
// flex-контейнера блокируются независимо от своего `display`.
const textStyle: CSSProperties = { color: 'var(--ink)' };
const timeStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Итог красится нефритом только при «сдал» — единственный смысл, за которым
// этот цвет закреплён (docs/adr/0031, тот же приём, что ExamAttemptOutcome.tsx).
const outcomeStyle: CSSProperties = { color: 'var(--ink)' };
const passedOutcomeStyle: CSSProperties = { ...outcomeStyle, color: 'var(--jade)' };

export function NotificationRow({ item, nowIso, isLast, onRead }: NotificationRowProps) {
  const unread = isUnread(item);

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

  return (
    <li style={{ borderBottom: isLast ? undefined : '1px solid var(--line)' }}>
      {unread ? (
        <button type="button" onClick={onRead} style={rowButtonStyle}>
          {/* Первый узел кнопки — точка непрочитанного скринридеру не видна,
              её цвет ничего не говорит без слов. */}
          <span className="xuanxue-sr-only">Не прочитано</span>
          {body}
        </button>
      ) : (
        <div style={rowStyle}>{body}</div>
      )}
    </li>
  );
}
