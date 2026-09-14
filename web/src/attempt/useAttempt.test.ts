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

describe('useAttempt — ссылка на видео', () => {
  it('успех: POST на media/link с телом { url }, потом перечитанная попытка с media', async () => {
    const withMedia: ExamAttemptDto = {
      ...ATTEMPT,
      status: 'submitted',
      media: [
        {
          id: 'm1',
          attemptId: 'a1',
          kind: 'link',
          url: 'https://example.com/v',
          receivedAt: '2026-09-12T00:00:00Z',
        },
      ],
    };
    mockedApiFetch
      .mockResolvedValueOnce([ATTEMPT])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([withMedia]);
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    let ok = false;
    await act(async () => {
      ok = await result.current.addMediaLink('https://example.com/v');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/link', {
      method: 'POST',
      body: { url: 'https://example.com/v' },
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.attempt?.media).toEqual(withMedia.media));
    expect(result.current.addMediaLinkError).toBeNull();
    expect(result.current.addingMediaLink).toBe(false);
  });

  it('сбой сервера — ошибка видна, false возвращается, ссылка не потеряна для формы', async () => {
    mockedApiFetch
      .mockResolvedValueOnce([ATTEMPT])
      .mockRejectedValueOnce(
        new ApiError('Это не похоже на ссылку на видео.', 400, 'invalid_input'),
      );
    const { result } = renderHook(() => useAttempt('a1'));
    await waitFor(() => expect(result.current.attempt).not.toBeNull());

    let ok = true;
    await act(async () => {
      ok = await result.current.addMediaLink('не-ссылка');
    });

    expect(ok).toBe(false);
    expect(result.current.addMediaLinkError?.message).toBe(
      'Это не похоже на ссылку на видео.',
    );
  });
});
