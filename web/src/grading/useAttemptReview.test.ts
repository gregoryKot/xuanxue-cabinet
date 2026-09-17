import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptReviewDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useAttemptReview } from './useAttemptReview';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeReview(overrides: Partial<AttemptReviewDto> = {}): AttemptReviewDto {
  return {
    attemptId: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    blocks: [],
    rubric: [{ id: 'c1', title: 'Устойчивость', maxScore: 5 }],
    ...overrides,
  };
}

describe('useAttemptReview — загрузка', () => {
  it('запрашивает карточку проверки по attemptId', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeReview());
    const { result } = renderHook(() => useAttemptReview('a1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/review', expect.anything());
    expect(result.current.review?.examTitle).toBe('Форма первого уровня');
  });

  it('ApiError — текст сервера в error', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Работа не найдена', 404, 'not_found'),
    );
    const { result } = renderHook(() => useAttemptReview('a1'));

    await waitFor(() => expect(result.current.error).toBe('Работа не найдена'));
  });
});

describe('useAttemptReview — отправка оценки', () => {
  it('успех: PUT на grading с телом, потом перечитанная карточка (read-after-write)', async () => {
    const graded = makeReview({
      status: 'graded',
      grading: {
        id: 'g1',
        attemptId: 'a1',
        examId: 'e1',
        userId: 'u1',
        graderId: 't1',
        criteria: [{ id: 'c1', title: 'Устойчивость', maxScore: 5, score: 4 }],
        outcome: 'passed',
        gradedAt: '2026-01-01T00:00:00Z',
      },
    });
    mockedApiFetch
      .mockResolvedValueOnce(makeReview())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(graded);
    const { result } = renderHook(() => useAttemptReview('a1'));
    await waitFor(() => expect(result.current.review).not.toBeNull());

    const input = {
      criteria: [{ id: 'c1', score: 4 }],
      outcome: 'passed' as const,
    };
    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submitGrading(input);
    });

    expect(succeeded).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/grading', {
      method: 'PUT',
      body: input,
    });
    await waitFor(() => expect(result.current.review?.status).toBe('graded'));
    expect(result.current.saveError).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  it('сбой: ошибка видна, review не перечитывается', async () => {
    mockedApiFetch
      .mockResolvedValueOnce(makeReview())
      .mockRejectedValueOnce(
        new ApiError(
          'Баллы по критерию «Устойчивость» — от 0 до 5.',
          400,
          'invalid_input',
        ),
      );
    const { result } = renderHook(() => useAttemptReview('a1'));
    await waitFor(() => expect(result.current.review).not.toBeNull());

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.submitGrading({
        criteria: [{ id: 'c1', score: 9 }],
        outcome: 'passed',
      });
    });

    expect(succeeded).toBe(false);
    expect(result.current.saveError?.message).toBe(
      'Баллы по критерию «Устойчивость» — от 0 до 5.',
    );
    expect(result.current.review?.status).toBe('submitted');
  });
});

describe('useAttemptReview — ручная отметка видео (у своего вопроса, ADR-0037)', () => {
  it('успех: POST на media/manual с itemId, потом перечитанная карточка с media (read-after-write)', async () => {
    const withMedia = makeReview({
      media: [
        {
          id: 'm1',
          attemptId: 'a1',
          itemId: 'q1',
          kind: 'manual',
          receivedAt: '2026-09-12T00:00:00Z',
        },
      ],
    });
    mockedApiFetch
      .mockResolvedValueOnce(makeReview())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(withMedia);
    const { result } = renderHook(() => useAttemptReview('a1'));
    await waitFor(() => expect(result.current.review).not.toBeNull());

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.markMediaManual('q1');
    });

    expect(succeeded).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/manual', {
      method: 'POST',
      body: { itemId: 'q1' },
    });
    await waitFor(() => expect(result.current.review?.media).toEqual(withMedia.media));
    expect(result.current.markMediaStateFor('q1')).toEqual({
      pending: false,
      error: null,
    });
  });

  it('сбой сервера — ошибка видна только у отмеченного вопроса, false возвращается', async () => {
    mockedApiFetch
      .mockResolvedValueOnce(makeReview())
      .mockRejectedValueOnce(new ApiError('Сеть подвела', 500, 'internal_error'));
    const { result } = renderHook(() => useAttemptReview('a1'));
    await waitFor(() => expect(result.current.review).not.toBeNull());

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.markMediaManual('q1');
    });

    expect(succeeded).toBe(false);
    expect(result.current.markMediaStateFor('q1').error?.message).toBe('Сеть подвела');
    expect(result.current.markMediaStateFor('q2')).toEqual({
      pending: false,
      error: null,
    });
  });
});
