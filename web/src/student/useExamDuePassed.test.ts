// «Срок сдачи прошёл» на карточке (ADR-0125) — момент «сейчас» фиксирован
// поддельными таймерами, тик проверяется отдельно (тот же приём, что у
// useExamTimeLine.test.ts).
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { useExamDuePassed } from './useExamDuePassed';

const NOW = '2026-09-25T00:00:00Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 2,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('useExamDuePassed', () => {
  it('нет срока — false, без тика', () => {
    const { result } = renderHook(() => useExamDuePassed(makeExam()));

    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('срок в будущем — false', () => {
    const { result } = renderHook(() =>
      useExamDuePassed(makeExam({ dueAt: '2026-09-30T20:59:00Z' })),
    );

    expect(result.current).toBe(false);
  });

  it('срок уже прошёл — true', () => {
    const { result } = renderHook(() =>
      useExamDuePassed(makeExam({ dueAt: '2026-09-20T20:59:00Z' })),
    );

    expect(result.current).toBe(true);
  });

  it('срок наступает, пока экран открыт — флаг переключается сам', () => {
    const { result } = renderHook(() =>
      useExamDuePassed(makeExam({ dueAt: '2026-09-25T00:00:30Z' })),
    );
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(true);
  });
});
