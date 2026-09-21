// Тикающий отсчёт (отзыв владельца 2026-09-21) — фейковые таймеры: секунда
// экранного времени должна быть секундой в тесте, без реального ожидания
// (CLAUDE.md «Детерминизм»).
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttemptDeadlineTimer } from './AttemptDeadlineTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function deadlineIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe('AttemptDeadlineTimer', () => {
  // Форма без лимита времени этот компонент не монтирует вовсе — проверяет
  // AttemptInProgress.test.tsx, здесь `deadlineAt` всегда есть.
  it('тикает раз в секунду', () => {
    render(<AttemptDeadlineTimer deadlineAt={deadlineIn(65_000)} onExpired={vi.fn()} />);
    expect(screen.getByText('Осталось 1:05')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Осталось 1:04')).toBeInTheDocument();
  });

  it('меньше 5 минут — тревожный тон (пилюля var(--panel-warm)/var(--danger))', () => {
    render(
      <AttemptDeadlineTimer
        deadlineAt={deadlineIn(4 * 60_000 + 59_000)}
        onExpired={vi.fn()}
      />,
    );

    // Не /^Осталось /: скрытая строка для скринридера в этот момент тоже
    // начинается с «Осталось» (announcement — «Осталось меньше 5 минут»),
    // regex поймал бы оба узла.
    const label = screen.getByText('Осталось 4:59');
    expect(label.style.background).toBe('var(--panel-warm)');
    expect(label.style.color).toBe('var(--danger)');
    expect(label.style.fontWeight).toBe('600');
  });

  it('больше 5 минут — спокойный тон, без заливки', () => {
    render(
      <AttemptDeadlineTimer deadlineAt={deadlineIn(10 * 60_000)} onExpired={vi.fn()} />,
    );

    const label = screen.getByText(/^Осталось /);
    expect(label.style.background).toBe('');
    expect(label.style.color).toBe('var(--ink-soft)');
  });

  it('onExpired зовётся один раз при переходе через ноль, не на каждом тике', () => {
    const onExpired = vi.fn();
    render(<AttemptDeadlineTimer deadlineAt={deadlineIn(500)} onExpired={onExpired} />);
    expect(onExpired).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('скрытая строка для скринридера появляется только у порогов', () => {
    const { rerender } = render(
      <AttemptDeadlineTimer deadlineAt={deadlineIn(10 * 60_000)} onExpired={vi.fn()} />,
    );
    expect(screen.getByRole('status').textContent).toBe('');

    rerender(
      <AttemptDeadlineTimer deadlineAt={deadlineIn(4 * 60_000)} onExpired={vi.fn()} />,
    );
    expect(screen.getByRole('status').textContent).toBe('Осталось меньше 5 минут');

    rerender(
      <AttemptDeadlineTimer deadlineAt={deadlineIn(30_000)} onExpired={vi.fn()} />,
    );
    expect(screen.getByRole('status').textContent).toBe('Осталось меньше минуты');
  });
});
