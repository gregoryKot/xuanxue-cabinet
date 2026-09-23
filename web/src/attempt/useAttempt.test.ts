// Отправка попытки: успех правит попытку ответом самого POST (ADR-0094, без
// второго GET) — статус на экране приходит с сервера, а не рисуется по факту
// нажатия; сбой оставляет ошибку видимой на экране сдачи, потому что диалог
// подтверждения к этому моменту уже закрылся (useAttempt.ts, комментарий к
// `submit`).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ATTEMPT_NOT_FOUND_MESSAGE, type ExamAttemptDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { writeAttemptAnswerDraft } from './attemptLocalDraft';
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
  it('успех: ровно один запрос на submit(), попытка правится его ответом', async () => {
    const submitted: ExamAttemptDto = { ...ATTEMPT, status: 'submitted' };
    mockedApiFetch.mockResolvedValueOnce(ATTEMPT).mockResolvedValueOnce(submitted);
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    await act(async () => {
      await result.current.submit();
    });

    expect(mockedApiFetch).toHaveBeenNthCalledWith(1, '/attempts/a1', expect.anything());
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/submit', {
      method: 'POST',
    });
    // Загрузка своей попытки + submit(), ни одного похода в сеть сверх этого
    // (нет reload()).
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.attempt).toEqual(submitted);
    expect(result.current.submitError).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('сбой: ошибка видна на экране, попытка осталась в работе', async () => {
    mockedApiFetch
      .mockResolvedValueOnce(ATTEMPT)
      .mockRejectedValueOnce(new ApiError('Нет связи с сервером.', 0, 'network'));
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.submitError?.message).toBe('Нет связи с сервером.');
    expect(result.current.attempt?.status).toBe('in_progress');
  });

  it('успех: локальный черновик ответов (attemptLocalDraft.ts) убирается целиком', async () => {
    // Аудит 2026-09-21 «потеря ответа ученика»: отправленную попытку больше
    // не редактируют, черновик, оставшийся с сеанса с потерянной сетью, не
    // должен пережить submit().
    writeAttemptAnswerDraft('a1', { itemId: 'q1', text: 'недосохранённое' });
    const submitted: ExamAttemptDto = { ...ATTEMPT, status: 'submitted' };
    mockedApiFetch.mockResolvedValueOnce(ATTEMPT).mockResolvedValueOnce(submitted);
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    await act(async () => {
      await result.current.submit();
    });

    expect(localStorage.getItem('xuanxue.draft.attempt:a1')).toBeNull();
  });
});

describe('useAttempt — загрузка своей попытки', () => {
  it('404 «попытка не найдена» — текст ошибки с сервера, попытки нет', async () => {
    // Ответ по пути, а не очередь `…Once` (ADR-0116, apiFetchMock.ts).
    mockApiByPath({
      '/attempts/': new ApiError(ATTEMPT_NOT_FOUND_MESSAGE, 404, 'not_found'),
    });

    const { result } = renderHook(() => useAttempt('чужая-или-неизвестная'));

    await waitFor(() => expect(result.current.error).toBe(ATTEMPT_NOT_FOUND_MESSAGE));
    expect(result.current.attempt).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/attempts/чужая-или-неизвестная',
      expect.anything(),
    );
  });
});
