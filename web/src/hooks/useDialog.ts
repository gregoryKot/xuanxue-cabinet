// a11y-связка для fullscreen-листов/диалогов (CLAUDE.md «Доступность»),
// отдельно от useHistorySheet (та отвечает за кнопку «Назад» браузера): Esc
// закрывает лист, фокус уходит на заголовок при открытии и возвращается на
// элемент, с которого лист открыли, фон не скроллится, пока лист открыт.
// Tab/Shift+Tab заперты внутри контейнера диалога, а фон помечен `inert`
// (аудит M3, docs/audits/2026-09-12-quality-audit.md) — обход фокусируемых и
// сама ловушка вынесены в focusTrap.ts.
import { useEffect, useRef, type RefObject } from 'react';
import { markBackgroundInert, trapTabKey } from './focusTrap';

export interface UseDialogResult {
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Корень диалога (`role="dialog"`) — по нему ищутся фокусируемые элементы
   * для ловушки Tab и соседи для `inert`. Потребитель обязан навесить его на
   * тот же узел, что и role="dialog". */
  containerRef: RefObject<HTMLElement | null>;
}

// Стек id открытых диалогов на уровне модуля — ConfirmDialog поверх
// LessonSheet: у обоих свой useDialog, оба слушают document.keydown, и без
// стека один Esc/Tab обработались бы обоими сразу (ревью п.8). Реагирует
// только верхний id стека — диалог, открытый последним.
let nextDialogId = 0;
const openDialogStack: number[] = [];

export function useDialog(onClose: () => void): UseDialogResult {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLElement>(null);
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
    // inert не зависит от стека: каждый диалог метит собственных соседей, а
    // вложенность на восстановление не влияет — см. комментарий в focusTrap.ts.
    const restoreInert = containerRef.current
      ? markBackgroundInert(containerRef.current)
      : null;

    function handleKeyDown(event: KeyboardEvent) {
      if (openDialogStack[openDialogStack.length - 1] !== dialogId) return;
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && containerRef.current) {
        trapTabKey(containerRef.current, event);
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      restoreInert?.();
      previouslyFocused.current?.focus();
      const index = openDialogStack.indexOf(dialogId);
      if (index !== -1) openDialogStack.splice(index, 1);
    };
  }, []);

  return { headingRef, containerRef };
}
