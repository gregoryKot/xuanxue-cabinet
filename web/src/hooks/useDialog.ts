// a11y-связка для fullscreen-листов/диалогов (CLAUDE.md «Доступность»),
// отдельно от useHistorySheet (та отвечает за кнопку «Назад» браузера): Esc
// закрывает лист, фокус уходит на заголовок при открытии и возвращается на
// элемент, с которого лист открыли, фон не скроллится, пока лист открыт.
import { useEffect, useRef, type RefObject } from 'react';

export interface UseDialogResult {
  headingRef: RefObject<HTMLHeadingElement | null>;
}

export function useDialog(onClose: () => void): UseDialogResult {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, []);

  return { headingRef };
}
