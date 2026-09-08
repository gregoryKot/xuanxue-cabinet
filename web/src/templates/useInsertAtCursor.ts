// Ref на textarea + возврат курсора после вставки чипом (CLAUDE.md «Доступность»
// задачи п.2) — вынесено из TemplateEditor.tsx, чтобы не пробить файловый
// храповик (150 строк). textarea контролируемая (value=text): DOM получает
// новый текст только на следующем рендере, поэтому `setSelectionRange` не
// сработает сразу после onChange — курсор ставится в эффекте по изменению
// `text`, иначе учитель после каждого клика по чипу теряет место в тексте.
import { useEffect, useRef } from 'react';
import { insertPlaceholder } from './insertPlaceholder';

export interface UseInsertAtCursorResult {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  insertAtCursor: (name: string) => void;
}

export function useInsertAtCursor(
  text: string,
  onChange: (text: string) => void,
): UseInsertAtCursorResult {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCursor.current === null) return;
    const cursor = pendingCursor.current;
    pendingCursor.current = null;
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(cursor, cursor);
  }, [text]);

  function insertAtCursor(name: string): void {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const inserted = insertPlaceholder(text, start, end, name);
    pendingCursor.current = inserted.cursor;
    onChange(inserted.text);
  }

  return { textareaRef, insertAtCursor };
}
