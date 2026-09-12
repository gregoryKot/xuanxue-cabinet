import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useAttemptAutosave } from './useAttemptAutosave';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const ATTEMPT_ID = 'attempt-1';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  mockedApiFetch.mockReset();
  vi.useRealTimers();
});

describe('useAttemptAutosave — дебаунс', () => {
  it('несколько правок текста подряд — один PATCH через 2 секунды, не на каждый символ', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => {
      result.current.setText('item-1', 'о');
      result.current.setText('item-1', 'от');
      result.current.setText('item-1', 'ответ');
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/attempt-1/answers', {
      method: 'PATCH',
      body: { answers: [{ itemId: 'item-1', text: 'ответ' }] },
    });
  });

  it('выбор одного варианта — тело с optionIds одного элемента', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setOptions('item-2', ['opt-a']));
    await act(async () => {
      result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/attempt-1/answers', {
      method: 'PATCH',
      body: { answers: [{ itemId: 'item-2', optionIds: ['opt-a'] }] },
    });
  });

  it('несколько вариантов — тело с полным списком optionIds', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setOptions('item-3', ['opt-a', 'opt-b']));
    await act(async () => {
      result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/attempt-1/answers', {
      method: 'PATCH',
      body: { answers: [{ itemId: 'item-3', optionIds: ['opt-a', 'opt-b'] }] },
    });
  });

  it('flush сохраняет немедленно, не дожидаясь дебаунса', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('useAttemptAutosave — сбой и повтор', () => {
  it('сбой сохранения виден (status «error») и повторяется сам, без кнопки', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.status).toBe('error');
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });
});
