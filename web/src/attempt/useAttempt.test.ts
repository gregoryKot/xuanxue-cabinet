// Отправка попытки: успех перечитывает список (read-after-write — статус на
// экране приходит с сервера, а не рисуется по факту нажатия), сбой оставляет
// ошибку видимой на экране сдачи, потому что диалог подтверждения к этому
// моменту уже закрылся (useAttempt.ts, комментарий к `submit`).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useAttempt } from './useAttempt';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const ATTEMPT: ExamAttemptDto = {
  id: 'a1',
  examId: 'e1',
  examTitle: 'Форма первого уровня',
  userId: 'u1',
  status: 'in_progress',
  blocks: [],
  answers: [],
  startedAt: '2026-09-01T00:00:00Z',
  expired: false,
};

describe('useAttempt — отправка', () => {
  it('успех: POST на submit, потом перечитанный список со статусом «отправлено»', async () => {
    mockedApiFetch
      .mockResolvedValueOnce([ATTEMPT])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ ...ATTEMPT, status: 'submitted' }]);
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    await act(async () => {
      await result.current.submit();
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/submit', {
      method: 'POST',
    });
    await waitFor(() => expect(result.current.attempt?.status).toBe('submitted'));
    expect(result.current.submitError).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('сбой: ошибка видна на экране, попытка осталась в работе', async () => {
    mockedApiFetch
      .mockResolvedValueOnce([ATTEMPT])
      .mockRejectedValueOnce(new ApiError('Нет связи с сервером.', 0, 'network'));
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.submitError?.message).toBe('Нет связи с сервером.');
    expect(result.current.attempt?.status).toBe('in_progress');
  });
});
