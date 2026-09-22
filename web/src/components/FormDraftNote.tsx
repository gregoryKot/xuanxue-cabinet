// Строка о восстановленном черновике (ADR-0052) — над полями формы, сразу
// под заголовком. Не role="alert": это не ошибка, и прокрутка к первому
// сообщению об ошибке (lib/scrollToFirstAlert.ts) не должна цепляться за неё.
import { noteStyle } from './screenLayout';
import { TextLinkButton } from './TextLinkButton';

const NOTE_TEXT = 'Здесь то, что вы набрали в прошлый раз.';
const DISCARD_LABEL = 'Убрать черновик';

interface FormDraftNoteProps {
  restored: boolean;
  onDiscard: () => void;
}

export function FormDraftNote({ restored, onDiscard }: FormDraftNoteProps) {
  if (!restored) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={noteStyle}>{NOTE_TEXT}</p>
      <TextLinkButton onClick={onDiscard}>{DISCARD_LABEL}</TextLinkButton>
    </div>
  );
}
