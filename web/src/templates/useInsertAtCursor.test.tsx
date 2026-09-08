// Небольшой компонент-обёртка вместо ручной подмены ref: хук управляет
// настоящим <textarea>, поведение (курсор/фокус) проверяем через реальный DOM,
// как это делает TemplateEditor.tsx (CLAUDE.md задача п.2).
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useInsertAtCursor } from './useInsertAtCursor';

function Harness() {
  const [text, setText] = useState('минут');
  const { textareaRef, insertAtCursor } = useInsertAtCursor(text, setText);
  return (
    <>
      <textarea
        ref={textareaRef}
        aria-label="текст"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" onClick={() => insertAtCursor('название')}>
        вставить
      </button>
    </>
  );
}

describe('useInsertAtCursor', () => {
  it('вставляет в позицию курсора (0 в пустой/нетронутой textarea), возвращает фокус', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const textarea = screen.getByLabelText<HTMLTextAreaElement>('текст');
    await user.click(screen.getByRole('button', { name: 'вставить' }));

    expect(textarea).toHaveValue('{название}минут');
    expect(textarea).toHaveFocus();
    const expectedCursor = '{название}'.length;
    expect(textarea.selectionStart).toBe(expectedCursor);
    expect(textarea.selectionEnd).toBe(expectedCursor);
  });
});

// Без привязанного ref (textarea ещё не отрисована или скрыта) вставка идёт
// в конец текста, а не роняет обработчик — ветка `?? text.length`.
function HarnessWithoutTextarea() {
  const [text, setText] = useState('пока без поля');
  const { insertAtCursor } = useInsertAtCursor(text, setText);
  return (
    <>
      <p>{text}</p>
      <button type="button" onClick={() => insertAtCursor('ссылка')}>
        вставить
      </button>
    </>
  );
}

describe('useInsertAtCursor без textarea', () => {
  it('вставляет в конец текста и не падает', async () => {
    const user = userEvent.setup();
    render(<HarnessWithoutTextarea />);

    await user.click(screen.getByRole('button', { name: 'вставить' }));

    expect(screen.getByText('пока без поля{ссылка}')).toBeInTheDocument();
  });
});
