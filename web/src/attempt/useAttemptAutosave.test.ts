import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_EXPIRED_MESSAGE } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
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

describe('useAttemptAutosave — сеть вернулась и параллельная правка', () => {
  it('правка во время сохранения не теряется: уходит вторым запросом', async () => {
    let finishFirst: (() => void) | undefined;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'первый'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    // Пока первый запрос висит, человек правит другой ответ и уходит с поля.
    act(() => result.current.setText('item-2', 'второй'));
    act(() => result.current.flush());
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishFirst?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/attempts/attempt-1/answers', {
      method: 'PATCH',
      body: { answers: [{ itemId: 'item-2', text: 'второй' }] },
    });
  });

  it('вернулась сеть — несохранённое уходит сразу, не дожидаясь таймера повтора', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.status).toBe('error');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('сеть вернулась, а сохранять нечего — лишнего запроса нет', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('useAttemptAutosave — пустые ветки', () => {
  it('flush без единой правки не шлёт запрос', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    await act(async () => {
      result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('два сбоя подряд — повтор остаётся один, таймеры не множатся', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.status).toBe('error');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('saved');
  });
});

describe('useAttemptAutosave — уход с экрана', () => {
  it('ушли со страницы с недописанным ответом — висящие таймеры сняты, запрос не летит в пустоту', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe('useAttemptAutosave — дедлайн решает сервер', () => {
  it('сервер отклонил сохранение по дедлайну — не повторяет бесконечно, зовёт onExpired один раз', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(ATTEMPT_EXPIRED_MESSAGE, 400, 'invalid_input'),
    );
    const onExpired = vi.fn();
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, [], onExpired));

    act(() => result.current.setText('item-1', 'поздно'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.status).toBe('error');
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    // Иначе кабинет «минутами пишет ответы в пустоту» (блокер аудита
    // 2026-09-15): без этой проверки повтор продолжал бы стучаться в уже
    // закрытую попытку каждые 4 секунды.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('обычный сетевой сбой — по-прежнему повторяет сам, onExpired не зовётся', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const onExpired = vi.fn();
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, [], onExpired));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.status).toBe('error');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('useAttemptAutosave — брошенная попытка', () => {
  it('открывается с уже сохранёнными ответами, и дозапись шлёт только изменённый', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAttemptAutosave(ATTEMPT_ID, [
        { itemId: 'item-1', text: 'начал вчера' },
        { itemId: 'item-2', optionIds: ['opt-a'] },
      ]),
    );

    expect(result.current.getAnswer('item-1')?.text).toBe('начал вчера');
    expect(result.current.getAnswer('item-2')?.optionIds).toEqual(['opt-a']);

    act(() => result.current.setText('item-1', 'дописал сегодня'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/attempt-1/answers', {
      method: 'PATCH',
      body: { answers: [{ itemId: 'item-1', text: 'дописал сегодня' }] },
    });
  });
});
