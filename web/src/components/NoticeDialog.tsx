// Попап с одной кнопкой — сообщить и закрыть, без развилки «Отмена/Действие»
// (пример — «Время вышло», useExpiryNotice.ts на экране сдачи экзамена).
// Не ConfirmDialog.tsx: там всегда пара кнопок, второй пропс здесь был бы
// лишним, а копия его оверлея и карточки поймал бы check-jscpd-ratchet.mjs —
// оба берут общую DialogShell.tsx (CLAUDE.md «Одна механика — один компонент»).
import { Button } from './Button';
import { DialogShell } from './DialogShell';
import { RichText } from './RichText';

// «Закрыть», а не «Понятно»: короткий текст интерфейса начинается с глагола
// (docs/VOICE.md), и кнопка называет ровно то, что делает.
const DEFAULT_CLOSE_LABEL = 'Закрыть';

interface NoticeDialogProps {
  title: string;
  message: string;
  /** По умолчанию «Закрыть». */
  closeLabel?: string;
  onClose: () => void;
}

export function NoticeDialog({
  title,
  message,
  closeLabel = DEFAULT_CLOSE_LABEL,
  onClose,
}: NoticeDialogProps) {
  return (
    <DialogShell
      title={title}
      onClose={onClose}
      renderActions={(close) => (
        <Button type="button" variant="primary" onClick={close}>
          {closeLabel}
        </Button>
      )}
    >
      {/* Через RichText (ADR-0124) — акцент в тексте попапа. */}
      <p style={{ margin: 0 }}>
        <RichText text={message} />
      </p>
    </DialogShell>
  );
}
