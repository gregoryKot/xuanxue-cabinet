// Видимость вкладки подменяется геттером `document.visibilityState` (jsdom
// не даёт её переключить иначе) — событие visibilitychange диспетчерится
// вручную, время идёт по фейковым таймерам (CLAUDE.md «Детерминизм»): без
// этого тест зависел бы от настоящего интервала в минуту.
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePollWhileVisible } from './usePollWhileVisible';

const INTERVAL_MS = 60_000;

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(value: DocumentVisibilityState): void {
  visibility = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('usePollWhileVisible', () => {
  it('на монтировании сам refresh() не зовёт', () => {
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('зовёт refresh каждый интервал, пока вкладка видима', () => {
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('пока вкладка скрыта — не зовёт', () => {
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    setVisibility('hidden');
    vi.advanceTimersByTime(INTERVAL_MS * 3);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('на возврате во вкладку зовёт сразу, не дожидаясь тика', () => {
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    setVisibility('hidden');
    setVisibility('visible');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('после возврата заводит интервал заново', () => {
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    setVisibility('hidden');
    setVisibility('visible');
    refresh.mockClear();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('не заводит интервал, если вкладка уже скрыта при монтировании', () => {
    visibility = 'hidden';
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    vi.advanceTimersByTime(INTERVAL_MS * 3);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('второе событие «видима» подряд не заводит второй интервал', () => {
    const refresh = vi.fn();
    renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));

    // visibilitychange приходит и без смены состояния (Safari — на pageshow):
    // прежний таймер обязан сняться, иначе тиков станет два вместо одного.
    setVisibility('visible');
    refresh.mockClear();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('после размонтирования не зовёт', () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => usePollWhileVisible(refresh, INTERVAL_MS));
    unmount();

    vi.advanceTimersByTime(INTERVAL_MS * 5);

    expect(refresh).not.toHaveBeenCalled();
  });
});
