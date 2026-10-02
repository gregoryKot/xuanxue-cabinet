// Таймер предпросмотра (просьба владельца 2026-10-02) — фейковые таймеры:
// секунда экранного времени должна быть секундой в тесте, без реального
// ожидания (CLAUDE.md «Детерминизм»). Тот же приём, что у
// attempt/AttemptDeadlineTimer.test.tsx.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamPreviewTimer } from './ExamPreviewTimer';

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExamPreviewTimer', () => {
  it('при открытии страницы показывает полный лимит экзамена', () => {
    render(<ExamPreviewTimer timeLimitMin={45} />);

    expect(screen.getByText('Осталось 45:00')).toBeInTheDocument();
  });

  it('тикает раз в секунду', () => {
    render(<ExamPreviewTimer timeLimitMin={45} />);

    act(() => {
      vi.advanceTimersByTime(SECOND_MS);
    });

    expect(screen.getByText('Осталось 44:59')).toBeInTheDocument();
  });

  it('по истечении лимита — «Время вышло», как у ученика', () => {
    render(<ExamPreviewTimer timeLimitMin={2} />);

    act(() => {
      vi.advanceTimersByTime(2 * MINUTE_MS + SECOND_MS);
    });

    expect(screen.getByText('Время вышло')).toBeInTheDocument();
    expect(screen.queryByText(/^Осталось /)).not.toBeInTheDocument();
  });
});
