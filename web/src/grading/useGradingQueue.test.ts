import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useGradingQueue } from './useGradingQueue';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    submittedAt: '2026-09-01T01:00:00Z',
    expired: false,
    ...overrides,
  };
}

describe('useGradingQueue — загрузка', () => {
  it('запрашивает сданные работы с лимитом 200', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useGradingQueue());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/attempts?status=submitted&limit=200',
      expect.anything(),
    );
  });

  it('успешная загрузка — attempts заполнен, loading снят', async () => {
    mockedApiFetch.mockResolvedValueOnce([makeAttempt()]);
    const { result } = renderHook(() => useGradingQueue());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attempts).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('ApiError — текст сервера в error', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    const { result } = renderHook(() => useGradingQueue());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });

  it('не-ApiError — общий текст, не сырое сообщение', async () => {
    mockedApiFetch.mockRejectedValue(new TypeError('внутренняя ошибка'));
    const { result } = renderHook(() => useGradingQueue());

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить очередь проверки. Попробуйте ещё раз.',
      ),
    );
  });

  it('reload() — повторный запрос', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useGradingQueue());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    await result.current.reload();

    expect(mockedApiFetch.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
