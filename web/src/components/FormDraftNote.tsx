// Строка о восстановленном черновике (ADR-0052) — над полями формы, сразу
// под заголовком. Не role="alert": это не ошибка, и прокрутка к первому
// сообщению об ошибке (lib/scrollToFirstAlert.ts) не должна цепляться за неё.
// Текст — человеческий, не канцелярский («Здесь то, что вы набрали...» читался
// машинным подстрочником, отзыв владельца 2026-09-27); формулировка общая для
// всех форм кабинета, компонент не привязан к домену.
import type { CSSProperties } from 'react';
import { RichText } from './RichText';
import { noteStyle } from './screenLayout';
import { TextLinkButton } from './TextLinkButton';

// Текст и «Убрать черновик» одной строкой: столбиком с кнопкой высотой 44 px
// заметка занимала на экране больше, чем поля под ней (снимок владельца
// 2026-09-27). На узком экране кнопка переносится под текст сама.
const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: 16,
};

const NOTE_TEXT = 'Вернули то, что вы не сохранили в прошлый раз.';
const DISCARD_LABEL = 'Убрать черновик';

interface FormDraftNoteProps {
  restored: boolean;
  onDiscard: () => void;
}

export function FormDraftNote({ restored, onDiscard }: FormDraftNoteProps) {
  if (!restored) return null;
  return (
    <div style={rowStyle}>
      {/* Через RichText (ADR-0124), хотя маркеров в NOTE_TEXT сейчас нет. */}
      <p style={noteStyle}>
        <RichText text={NOTE_TEXT} />
      </p>
      <TextLinkButton onClick={onDiscard}>{DISCARD_LABEL}</TextLinkButton>
    </div>
  );
}
