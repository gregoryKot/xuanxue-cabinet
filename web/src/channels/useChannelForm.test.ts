import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useChannelForm } from './useChannelForm';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useChannelForm — submit()', () => {
  it('невалидная форма — validationError, onCreate не зовётся', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() => useChannelForm(null, onCreate, vi.fn(), vi.fn()));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.validationError?.field).toBe('title');
    expect(result.current.validationError?.message).toMatch(/название/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('создание — валидная форма зовёт onCreate', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useChannelForm(null, onCreate, vi.fn(), vi.fn()));

    act(() => {
      result.current.setField('title', 'ВК школы');
      result.current.setField('token', 'secret');
      result.current.setField('peerIdText', '5');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalledWith({
      type: 'vk',
      title: 'ВК школы',
      config: { token: 'secret', peerId: 5 },
      tags: [],
    });
  });

  it('правка — смена ID беседы ВК без токена — validationError, onUpdate не зовётся (ревью п.2)', async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() =>
      useChannelForm(makeChannel(), vi.fn(), onUpdate, vi.fn()),
    );

    act(() => {
      result.current.setField('peerIdText', '999');
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.validationError?.field).toBe('peerIdText');
    expect(result.current.validationError?.message).toMatch(/токен заново/);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('правка — onUpdate по id канала, конфиг не тронут без токена', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChannelForm(makeChannel(), vi.fn(), onUpdate, vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onUpdate).toHaveBeenCalledWith('ch1', {
      title: 'ВК школы',
      active: true,
      tags: [],
    });
  });

  it('ApiError при сохранении — serverError с деталями, false', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', ['peerId: не число']),
      );
    const { result } = renderHook(() => useChannelForm(null, onCreate, vi.fn(), vi.fn()));

    act(() => {
      result.current.setField('title', 'ВК');
      result.current.setField('token', 't');
      result.current.setField('peerIdText', '1');
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.details).toEqual(['peerId: не число']);
  });

  it('не-ApiError сбой при сохранении — общий текст', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useChannelForm(makeChannel(), vi.fn(), onUpdate, vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });
});

describe('useChannelForm — remove()', () => {
  it('без выбранного канала — false, onRemove не вызывается', async () => {
    const onRemove = vi.fn();
    const { result } = renderHook(() => useChannelForm(null, vi.fn(), vi.fn(), onRemove));

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('успешно удаляет канал по id', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChannelForm(makeChannel(), vi.fn(), vi.fn(), onRemove),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(true);
    expect(onRemove).toHaveBeenCalledWith('ch1');
  });

  it('409 при удалении — serverError с текстом сервера', async () => {
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Канал используется в рассылке.', 409, 'conflict'));
    const { result } = renderHook(() =>
      useChannelForm(makeChannel(), vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe('Канал используется в рассылке.');
  });

  it('не-ApiError сбой при удалении — общий текст', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useChannelForm(makeChannel(), vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось удалить. Попробуйте ещё раз.',
    );
  });
});
