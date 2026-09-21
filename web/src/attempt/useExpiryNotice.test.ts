// Чистая логика попапа «Время вышло» (useExpiryNotice.ts) — без DOM,
// переходы статуса попытки через rerender.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { useExpiryNotice } from './useExpiryNotice';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'in_progress',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
    ...overrides,
  };
}

function renderExpiryNotice(initialAttempt: ExamAttemptDto | null) {
  return renderHook(({ attempt }) => useExpiryNotice(attempt), {
    initialProps: { attempt: initialAttempt },
  });
}

describe('useExpiryNotice', () => {
  it('попытка была in_progress, сервер закрыл её по времени — окно появляется', () => {
    const { result, rerender } = renderExpiryNotice(makeAttempt());
    expect(result.current.showing).toBe(false);

    rerender({ attempt: makeAttempt({ status: 'submitted', expired: true }) });

    expect(result.current.showing).toBe(true);
  });

  it('открыли сразу уже закрытую по времени попытку — окна нет', () => {
    const { result } = renderExpiryNotice(
      makeAttempt({ status: 'submitted', expired: true }),
    );

    expect(result.current.showing).toBe(false);
  });

  it('попытку сдали не по времени (expired: false) — окна нет', () => {
    const { result, rerender } = renderExpiryNotice(makeAttempt());

    rerender({ attempt: makeAttempt({ status: 'submitted', expired: false }) });

    expect(result.current.showing).toBe(false);
  });

  it('попытки ещё нет (экран грузится) — окна нет', () => {
    const { result } = renderExpiryNotice(null);

    expect(result.current.showing).toBe(false);
  });

  it('dismiss скрывает окно, и оно не возвращается при новых данных попытки', () => {
    const { result, rerender } = renderExpiryNotice(makeAttempt());
    rerender({ attempt: makeAttempt({ status: 'submitted', expired: true }) });
    expect(result.current.showing).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.showing).toBe(false);

    rerender({ attempt: makeAttempt({ status: 'submitted', expired: true }) });
    expect(result.current.showing).toBe(false);
  });
});
