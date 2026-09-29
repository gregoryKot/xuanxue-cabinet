// Название вкладки по странице (WCAG 2.4.2): ставится при показе и
// возвращается при уходе, чтобы экран без своего названия не оставил чужое.
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentTitle } from './useDocumentTitle';

const BASE_TITLE = 'Сюань-Сюэ';

beforeEach(() => {
  document.title = BASE_TITLE;
});

afterEach(() => {
  document.title = BASE_TITLE;
});

describe('useDocumentTitle', () => {
  it('ставит «<страница> — Сюань-Сюэ»', () => {
    renderHook(() => useDocumentTitle('Доступность'));

    expect(document.title).toBe('Доступность — Сюань-Сюэ');
  });

  it('при уходе со страницы возвращает прежнее название', () => {
    const { unmount } = renderHook(() => useDocumentTitle('Доступность'));

    unmount();

    expect(document.title).toBe(BASE_TITLE);
  });

  it('смена названия на месте — новое название, а не склейка со старым', () => {
    const { rerender, unmount } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: 'Вход' },
    });

    rerender({ title: 'Приглашение' });
    expect(document.title).toBe('Приглашение — Сюань-Сюэ');

    unmount();
    expect(document.title).toBe(BASE_TITLE);
  });
});
