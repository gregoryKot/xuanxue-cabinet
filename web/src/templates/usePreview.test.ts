import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { usePreview } from './usePreview';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('usePreview', () => {
  it('успех — POST /settings/preview с телом, result заполнен', async () => {
    mockedApiFetch.mockResolvedValueOnce({ text: 'Через 30 минут занятие' });
    const { result } = renderHook(() => usePreview());

    await act(async () => {
      await result.current.preview('lesson_link', 'l1');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/settings/preview', {
      method: 'POST',
      body: { kind: 'lesson_link', lessonId: 'l1' },
    });
    expect(result.current.result).toEqual({ text: 'Через 30 минут занятие' });
  });

  it('recordingIsStandIn — передаётся как есть', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      text: 'Тема занятия',
      recordingIsStandIn: true,
    });
    const { result } = renderHook(() => usePreview());

    await act(async () => {
      await result.current.preview('recording', 'l1');
    });

    expect(result.current.result?.recordingIsStandIn).toBe(true);
  });

  it('ApiError — текст сервера в error, result сброшен', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockResolvedValueOnce({ text: 'ok' });
    const { result } = renderHook(() => usePreview());
    await act(async () => {
      await result.current.preview('lesson_link', 'l1');
    });

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Занятие не найдено.', 404, 'not_found'),
    );
    await act(async () => {
      await result.current.preview('lesson_link', 'l2');
    });

    expect(result.current.error).toBe('Занятие не найдено.');
    expect(result.current.result).toBeNull();
  });

  it('не-ApiError сбой — общий текст', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePreview());

    await act(async () => {
      await result.current.preview('lesson_link', 'l1');
    });

    expect(result.current.error).toBe(
      'Не удалось показать предпросмотр. Попробуйте ещё раз.',
    );
  });
});
