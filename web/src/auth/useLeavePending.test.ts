// Регрессия на снимок владельца 2026-10-18: после «Назад» из Telegram обе
// кнопки входа крутили спиннер навсегда — Safari вернул страницу из кеша
// вместе с `pending`.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLeavePending } from './useLeavePending';

function pageShow(persisted: boolean): void {
  const event = new Event('pageshow') as Event & { persisted: boolean };
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

function setVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLeavePending', () => {
  it('до нажатия кнопка свободна, после — занята', () => {
    const { result } = renderHook(() => useLeavePending());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());

    expect(result.current[0]).toBe(true);
  });

  it('страница вернулась из кеша браузера («Назад») — кнопка снова свободна', () => {
    const { result } = renderHook(() => useLeavePending());
    act(() => result.current[1]());

    act(() => pageShow(true));

    expect(result.current[0]).toBe(false);
  });

  it('обычный pageshow без persisted ничего не меняет: переход ещё идёт', () => {
    const { result } = renderHook(() => useLeavePending());
    act(() => result.current[1]());

    act(() => pageShow(false));

    expect(result.current[0]).toBe(true);
  });

  it('вкладка снова видима (вернулись из приложения Telegram) — кнопка свободна', () => {
    const { result } = renderHook(() => useLeavePending());
    act(() => result.current[1]());

    act(() => setVisibility('hidden'));
    expect(result.current[0]).toBe(true);
    act(() => setVisibility('visible'));

    expect(result.current[0]).toBe(false);
  });

  it('пока кнопка свободна, событий не слушает', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useLeavePending());

    expect(addSpy).not.toHaveBeenCalledWith('pageshow', expect.any(Function));
  });
});
