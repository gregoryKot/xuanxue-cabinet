// Тик таймера: без него «сколько осталось» на экране сдачи застынет на
// значении первого рендера, и человек не увидит, что время кончилось.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('пересчитывает время каждый интервал и убирает таймер при размонтировании', () => {
    const { result, unmount } = renderHook(() => useNow(30_000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBeGreaterThan(first);

    const afterTick = result.current;
    unmount();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(afterTick);
  });
});
