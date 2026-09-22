// Строка про время на карточке экзамена (ADR-0120). Пояс зрителя — через
// stubViewerTimeZone, не пояс машины (CLAUDE.md «Детерминизм»): иначе тест
// зелёный в UTC и красный у владельца, который живёт в поясе школы. Момент
// «сейчас» — фиксированный, тик проверяется поддельными таймерами.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { useExamTimeLine } from './useExamTimeLine';

// Зритель — Europe/Moscow (пояс школы Asia/Jerusalem, имена зон разные),
// поэтому к часу закрытия положена приписка про часы.
stubViewerTimeZone();

const NOW = '2026-09-22T16:15:00Z';

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

describe('useExamTimeLine', () => {
  it('форма без лимита времени — строки нет', () => {
    const { result } = renderHook(() => useExamTimeLine(makeExam()));

    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('попытки ещё не было — сколько времени даётся, без тика', () => {
    const { result } = renderHook(() => useExamTimeLine(makeExam({ timeLimitMin: 40 })));

    expect(result.current).toBe('На попытку даётся 40 минут');
    // Неподвижной строке таймер не нужен: заданий на экране бывает десяток.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('попытка идёт — остаток, час закрытия по часам зрителя и пояс школы', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'in_progress',
        expired: false,
        deadlineAt: '2026-09-22T16:40:00Z',
      },
    });

    const { result } = renderHook(() => useExamTimeLine(exam));

    expect(result.current).toBe(
      'Осталось 25 мин, попытка закроется в 19:40 по вашим часам ' +
        '(школа живёт по Asia/Jerusalem)',
    );
  });

  it('остаток тает сам, пока экран открыт', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'in_progress',
        expired: false,
        deadlineAt: '2026-09-22T16:40:00Z',
      },
    });

    const { result } = renderHook(() => useExamTimeLine(exam));
    expect(result.current).toContain('Осталось 25 мин');

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(result.current).toContain('Осталось 20 мин');
  });

  it('зритель живёт по часам школы — приписки нет', () => {
    const exam = makeExam({
      timeLimitMin: 40,
      lastAttempt: {
        id: 'a1',
        status: 'in_progress',
        expired: false,
        deadlineAt: '2026-09-22T16:40:00Z',
      },
    });
    vi.stubEnv('TZ', 'Asia/Jerusalem');

    const { result } = renderHook(() => useExamTimeLine(exam));

    expect(result.current).toBe('Осталось 25 мин, попытка закроется в 19:40');
  });
});
