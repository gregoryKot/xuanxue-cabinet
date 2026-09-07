// a11y-связка для fullscreen-листов/диалогов (CLAUDE.md «Доступность»),
// отдельно от useHistorySheet (та отвечает за кнопку «Назад» браузера): Esc
// закрывает лист, фокус уходит на заголовок при открытии и возвращается на
// элемент, с которого лист открыли, фон не скроллится, пока лист открыт.
import { useEffect, useRef, type RefObject } from 'react';

export interface UseDialogResult {
  headingRef: RefObject<HTMLHeadingElement | null>;
}

// Стек id открытых диалогов на уровне модуля — ConfirmDialog поверх
// LessonSheet: у обоих свой useDialog, оба слушают document.keydown, и без
// стека один Esc закрыл бы разом лист и подтверждение (ревью п.8). На Esc
// реагирует только верхний id стека — диалог, открытый последним.
let nextDialogId = 0;
const openDialogStack: number[] = [];

export function useDialog(onClose: () => void): UseDialogResult {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialogId = ++nextDialogId;
    openDialogStack.push(dialogId);
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (openDialogStack[openDialogStack.length - 1] !== dialogId) return;
      onCloseRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
      const index = openDialogStack.indexOf(dialogId);
      if (index !== -1) openDialogStack.splice(index, 1);
    };
  }, []);

  return { headingRef };
}
