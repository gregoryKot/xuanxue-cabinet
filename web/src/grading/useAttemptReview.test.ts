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
        comment: 'Хорошо сдал',
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
      comment: 'Хорошо сдал',
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
          'Эту работу ещё нельзя проверить: ученик её не сдал.',
          400,
          'invalid_input',
        ),
      );
    const { result } = renderHook(() => useAttemptReview('a1'));
    await waitFor(() => expect(result.current.review).not.toBeNull());

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.submitGrading({
        outcome: 'passed',
      });
    });

    expect(succeeded).toBe(false);
    expect(result.current.saveError?.message).toBe(
      'Эту работу ещё нельзя проверить: ученик её не сдал.',
    );
    expect(result.current.review?.status).toBe('submitted');
  });
});

describe('useAttemptReview — ручная отметка видео', () => {
  it('успех: POST на media/manual, потом перечитанная карточка с media (read-after-write)', async () => {
    const withMedia = makeReview({
      media: [
        {
          id: 'm1',
          attemptId: 'a1',
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
      succeeded = await result.current.markMediaManual();
    });

    expect(succeeded).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/manual', {
      method: 'POST',
      body: {},
    });
    await waitFor(() => expect(result.current.review?.media).toEqual(withMedia.media));
    expect(result.current.markMediaError).toBeNull();
  });

  it('сбой сервера — ошибка видна, false возвращается', async () => {
    mockedApiFetch
      .mockResolvedValueOnce(makeReview())
      .mockRejectedValueOnce(new ApiError('Сеть подвела', 500, 'internal_error'));
    const { result } = renderHook(() => useAttemptReview('a1'));
    await waitFor(() => expect(result.current.review).not.toBeNull());

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.markMediaManual();
    });

    expect(succeeded).toBe(false);
    expect(result.current.markMediaError?.message).toBe('Сеть подвела');
  });
});
