// Объявление школы на доске (ADR-0172): текст учителя и «До 20 октября».
// Текст идёт через RichText — @ник в нём становится ссылкой, `**жирным**`
// работает, как в остальных строках кабинета. Объявления нет — секции нет
// вовсе: пустая плашка «Объявлений нет» заставляла бы ученика читать про
// отсутствие новостей (решает BoardScreen.tsx по `notice`, здесь только вид).
// Плашка тёплая (`--panel-warm`), как карточка экзамена: на экране это второй
// по важности блок после «Сдавать сейчас», крупная рамка ему ни к чему.
import type { CSSProperties } from 'react';
import type { BoardNotice } from '@xuanxue/shared';
import { RichText } from '../components/RichText';
import { boardNoticeUntilText } from './boardNoticeUntil';

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '16px 18px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
};
const textStyle: CSSProperties = { margin: 0, overflowWrap: 'anywhere' };
const untilStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface BoardNoticeCardProps {
  notice: BoardNotice;
}

export function BoardNoticeCard({ notice }: BoardNoticeCardProps) {
  return (
    <aside aria-label="Объявление школы" style={cardStyle}>
      <p style={textStyle}>
        <RichText text={notice.text} />
      </p>
      <p style={untilStyle}>{boardNoticeUntilText(notice.until)}</p>
    </aside>
  );
}
