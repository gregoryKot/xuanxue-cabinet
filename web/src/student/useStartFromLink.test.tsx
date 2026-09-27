// Глубокая ссылка `/tasks?start=<examId>` (ADR-0129) — чистая логика хука
// без сети: сам `apiFetch` здесь не участвует, `start` — переданный мок.
import { renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { useStartFromLink } from './useStartFromLink';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма 1',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

function renderWithLink(
  exams: MyExamDto[] | null,
  start: (exam: MyExamDto) => void,
  initialPath: string,
) {
  return renderHook(
    () => {
      useStartFromLink(exams, start);
      const [searchParams] = useSearchParams();
      return searchParams;
    },
    {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      ),
    },
  );
}

describe('useStartFromLink', () => {
  it('экзамен из ?start= найден — зовёт start() с ним и убирает параметр из URL', () => {
    const exam = makeExam();
    const start = vi.fn();

    const { result } = renderWithLink([exam], start, '/tasks?start=e1');

    expect(start).toHaveBeenCalledWith(exam);
    expect(result.current.get('start')).toBeNull();
  });

  it('список ещё не загружен (null) — ждёт, start() не зовёт', () => {
    const start = vi.fn();

    renderWithLink(null, start, '/tasks?start=e1');

    expect(start).not.toHaveBeenCalled();
  });

  it('параметра нет — start() не зовёт', () => {
    const start = vi.fn();

    renderWithLink([makeExam()], start, '/tasks');

    expect(start).not.toHaveBeenCalled();
  });

  it('экзамена с таким id нет в списке — start() не зовёт, но параметр убирает', () => {
    const start = vi.fn();

    const { result } = renderWithLink(
      [makeExam({ id: 'other' })],
      start,
      '/tasks?start=e1',
    );

    expect(start).not.toHaveBeenCalled();
    expect(result.current.get('start')).toBeNull();
  });

  // action null — попытки исчерпаны (myExamAttemptsLeft <= 0), нажимать
  // нечего: getMyExamAction возвращает null не только тогда, но это
  // единственный случай, легко воспроизводимый без лишних полей.
  it('у экзамена нечего нажимать (action null) — start() не зовёт', () => {
    const exhausted = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    const start = vi.fn();

    renderWithLink([exhausted], start, '/tasks?start=e1');

    expect(start).not.toHaveBeenCalled();
  });

  it('повторный рендер с тем же examId — start() зовётся один раз', () => {
    const exam = makeExam();
    const start = vi.fn();

    const { rerender } = renderHook(
      ({ exams }: { exams: MyExamDto[] | null }) => useStartFromLink(exams, start),
      {
        initialProps: { exams: [exam] },
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/tasks?start=e1']}>{children}</MemoryRouter>
        ),
      },
    );
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ exams: [exam] });

    expect(start).toHaveBeenCalledTimes(1);
  });
});
