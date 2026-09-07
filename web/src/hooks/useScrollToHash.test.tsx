import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HASH_HIGHLIGHT_CLASS, useScrollToHash } from './useScrollToHash';

function renderWithHash(hash: string, ready: boolean) {
  return renderHook(() => useScrollToHash(ready), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[`/planning${hash}`]}>{children}</MemoryRouter>
    ),
  });
}

// Отдельная переменная под мок, не `el.scrollIntoView` в `expect(...)` — иначе
// `@typescript-eslint/unbound-method` ругается на несвязанный метод объекта.
function appendLessonEl(scrollIntoView = vi.fn()) {
  const el = document.createElement('div');
  el.id = 'lesson-l1';
  el.scrollIntoView = scrollIntoView;
  document.body.appendChild(el);
  return { el, scrollIntoView };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('useScrollToHash', () => {
  it('элемент найден, ready — scrollIntoView и подсветка, снимается по таймеру', () => {
    vi.useFakeTimers();
    const { el, scrollIntoView } = appendLessonEl();

    renderWithHash('#lesson-l1', true);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(el.classList.contains(HASH_HIGHLIGHT_CLASS)).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(el.classList.contains(HASH_HIGHLIGHT_CLASS)).toBe(false);
  });

  it('ready=false — не трогает DOM (данные экрана ещё не готовы)', () => {
    const { scrollIntoView } = appendLessonEl();

    renderWithHash('#lesson-l1', false);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('элемент по хэшу не найден — не падает', () => {
    expect(() => renderWithHash('#lesson-unknown', true)).not.toThrow();
  });

  it('хэша нет — ничего не делает', () => {
    const { scrollIntoView } = appendLessonEl();

    renderWithHash('', true);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
