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
      void result.current.flush();
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
      void result.current.flush();
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
      void result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});

// Аудит 2026-09-21, HIGH «потеря последнего ответа ученика»: flush()
// раньше не возвращал ничего — AttemptInProgress.tsx не мог дождаться
// сохранения перед submit() и слал POST не глядя на исход PATCH. Три
// свойства промиса, на которые опирается эта проводка, — здесь.
describe('useAttemptAutosave — flush() возвращает промис (аудит 2026-09-21)', () => {
  it('резолвится после успешного PATCH', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await expect(result.current.flush()).resolves.toBeUndefined();
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('при ожидающей правке шлёт PATCH немедленно — таймер дебаунса не ждётся', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    // До flush() PATCH ещё не ушёл — ждёт дебаунса (2 с), которые здесь
    // нарочно не продвигаются фейковым таймером.
    expect(mockedApiFetch).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.flush();
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('реджектится при сбое сети — без ожидания фонового 4-секундного повтора', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await expect(result.current.flush()).rejects.toThrow('сеть недоступна');
    });

    // Один вызов — сразу ошибка, без ожидания встроенного повтора.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
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
    // flush() возвращает промис — `void` внутри act(), иначе act() решит,
    // что колбэк асинхронный, и тест не дождётся его сам (warning + гонка
    // со следующим тестом).
    act(() => result.current.setText('item-2', 'второй'));
    act(() => void result.current.flush());
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

  // Гейт: check-vitest-coverage-ratchet.mjs (functions) — ветка
  // «уже летит чужой PATCH» в useAttemptSaveRunner.ts ждёт его исход через
  // `.catch(() => undefined)`, а не падает вместе с ним: этот тест — на
  // случай, когда тот чужой (фоновый) PATCH сам проваливается.
  it('flush() застаёт чужой фоновый PATCH в полёте, тот проваливается — flush() пробует сама и добивается успеха', async () => {
    let rejectFirst: ((err: Error) => void) | undefined;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    // Пока фоновый (дебаунс-триггерный) PATCH висит без ответа, ученик жмёт
    // «Отправить» — flush() не открывает второй запрос поверх первого, а
    // дожидается его исхода (useAttemptSaveRunner.ts).
    act(() => void result.current.flush());
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirst?.(new Error('сеть недоступна'));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Провал чужой (фоновой) попытки — не повод для flush() молчать: ответ
    // так и остался несохранённым, она пробует сама вторым PATCH.
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
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
      void result.current.flush();
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

describe('useAttemptAutosave — закрытие вкладки', () => {
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  it('pagehide с ожидающей правкой — PATCH сразу, не дожидаясь дебаунса', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  // Гейт: check-vitest-coverage-ratchet.mjs (functions) — `run()` в
  // useAttemptAutosaveLifecycle.ts сам ловит провал flush() (`.catch(() => {})`);
  // выше PATCH на pagehide всегда успешен, здесь — нарочно нет.
  it('pagehide с ожидающей правкой, PATCH падает — сбой тихий, вкладка не падает', async () => {
    mockedApiFetch.mockRejectedValue(new Error('сеть недоступна'));
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
  });

  it('visibilitychange в hidden с ожидающей правкой — PATCH сразу', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange не в hidden (вернулись на вкладку) — запроса нет', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('без ожидающей правки — pagehide и visibilitychange ничего не шлют', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('размонтирование снимает слушатели — pagehide/visibilitychange после него молчат', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    unmount();
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe('useAttemptAutosave — локальный черновик (аудит 2026-09-21, MED «потеря ответа ученика»)', () => {
  const DRAFT_STORAGE_KEY = 'xuanxue.draft.attempt:attempt-1';

  it('несохранённый ответ переживает выгрузку вкладки — новый хук отправляет его сам', async () => {
    // Правка ушла в PATCH, сеть пропала раньше ответа (метро, форс-килл PWA):
    // повтор через 4 с уже не сработает — вкладку убила ОС.
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    const { result, unmount } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);

    // Вкладку выгрузили до повтора — таймеры сняты размонтированием, а
    // единственная копия ответа осталась в localStorage, не в памяти вкладки.
    unmount();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    // Новое открытие того же экрана — свежий хук того же attemptId; сервер
    // ответ ещё не видел (initialAnswers пуст), черновик его восстанавливает
    // и сразу отправляет, не дожидаясь новой правки от ученика.
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await act(async () => {
      renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/attempts/attempt-1/answers', {
      method: 'PATCH',
      body: { answers: [{ itemId: 'item-1', text: 'ответ' }] },
    });
  });

  // Гейт: check-vitest-coverage-ratchet.mjs (functions) — эффект
  // монтирования в useAttemptAutosave.ts сам ловит провал flush()
  // (`.catch(() => {})`); в тесте выше повторная отправка при монтировании
  // успешна, здесь — нарочно нет (сеть по-прежнему недоступна).
  it('черновик восстановлен, но повторная отправка при монтировании тоже падает — сбой тихий, черновик остаётся', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    const { result, unmount } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    unmount();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    let remounted: { current: ReturnType<typeof useAttemptAutosave> } | undefined;
    await act(async () => {
      remounted = renderHook(() => useAttemptAutosave(ATTEMPT_ID, [])).result;
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(remounted?.current.status).toBe('error');
    // Ничего не потеряно — просто ещё не долетело.
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();
  });

  it('успешное сохранение снимает локальную копию из localStorage', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'ответ'));
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('дедлайн закрыл попытку — локальный черновик убирается целиком', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(ATTEMPT_EXPIRED_MESSAGE, 400, 'invalid_input'),
    );
    const { result } = renderHook(() => useAttemptAutosave(ATTEMPT_ID, []));

    act(() => result.current.setText('item-1', 'поздно'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
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
