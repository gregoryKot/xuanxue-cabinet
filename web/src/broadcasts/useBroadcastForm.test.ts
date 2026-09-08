import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreateBroadcastInput } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useBroadcastForm } from './useBroadcastForm';

const UUID_RE = /^[0-9a-f-]{36}$/;

describe('useBroadcastForm — submit()', () => {
  it('невалидная форма — validationError, onCreate не зовётся', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() => useBroadcastForm(onCreate));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.validationError?.field).toBe('text');
    expect(result.current.validationError?.message).toMatch(/текст/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('валидная форма — зовёт onCreate с телом', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBroadcastForm(onCreate));

    act(() => {
      result.current.setField('text', 'Текст рассылки');
      result.current.setField('channelIds', ['c1']);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalledWith({
      text: 'Текст рассылки',
      channelIds: ['c1'],
      idempotencyKey: expect.stringMatching(UUID_RE) as string,
    });
  });

  it('повтор после сбоя — тот же idempotencyKey, успех потом — новый на следующей отправке', async () => {
    const onCreate = vi
      .fn<(input: CreateBroadcastInput) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useBroadcastForm(onCreate));
    act(() => {
      result.current.setField('text', 'Текст');
      result.current.setField('channelIds', ['c1']);
    });

    await act(async () => {
      await result.current.submit();
    });
    await act(async () => {
      await result.current.submit();
    });
    const calls = onCreate.mock.calls;
    const firstKey = calls[0]?.[0].idempotencyKey;
    const secondKey = calls[1]?.[0].idempotencyKey;
    expect(firstKey).toBeDefined();
    // Сбой не меняет ключ — повтор клика после ошибки считается тем же
    // запросом, не новой рассылкой.
    expect(secondKey).toBe(firstKey);

    await act(async () => {
      await result.current.submit();
    });
    const thirdKey = calls[2]?.[0].idempotencyKey;
    // Успех освобождает ключ — следующая (независимая) отправка новая.
    expect(thirdKey).toBeDefined();
    expect(thirdKey).not.toBe(secondKey);
  });

  it('повторный submit во время pending — не вызывает onCreate дважды', async () => {
    let resolveCreate: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { result } = renderHook(() => useBroadcastForm(onCreate));
    act(() => {
      result.current.setField('text', 'Текст');
      result.current.setField('channelIds', ['c1']);
    });

    let firstCallPromise: Promise<boolean>;
    act(() => {
      firstCallPromise = result.current.submit();
    });
    expect(result.current.pending).toBe(true);

    let secondOk = true;
    await act(async () => {
      secondOk = await result.current.submit();
    });

    expect(secondOk).toBe(false);
    expect(onCreate).toHaveBeenCalledTimes(1);

    resolveCreate?.();
    await act(async () => {
      await firstCallPromise;
    });
  });

  it('ApiError при сохранении — serverError с деталями, false', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', ['channelIds: выключен']),
      );
    const { result } = renderHook(() => useBroadcastForm(onCreate));
    act(() => {
      result.current.setField('text', 'Текст');
      result.current.setField('channelIds', ['c1']);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.details).toEqual(['channelIds: выключен']);
  });

  it('не-ApiError сбой — общий текст', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBroadcastForm(onCreate));
    act(() => {
      result.current.setField('text', 'Текст');
      result.current.setField('channelIds', ['c1']);
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось отправить. Попробуйте ещё раз.',
    );
  });
});
