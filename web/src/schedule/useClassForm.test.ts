// Валидация и сборка тела запроса — в classFormInput.test.ts (чистая логика,
// без хука). Здесь — только оркестрация: submit/remove вызывают правильный
// колбэк и правильно репортят ошибку.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useClassForm } from './useClassForm';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'telegram',
    title: 'Группа учеников',
    active: true,
    target: '@group',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useClassForm — создание', () => {
  it('пустое название — submit не вызывает onCreate, есть validationError', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() =>
      useClassForm(null, [], onCreate, vi.fn(), vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onCreate).not.toHaveBeenCalled();
    expect(result.current.validationError).toMatch(/название/);
  });

  it('успешный submit — вызывает onCreate с телом из состояния', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useClassForm(null, [], onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('title', '  Цигун  ');
      result.current.setField('rules', [
        { weekday: 1, time: '19:00', durationMinText: '60' },
      ]);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Цигун' }));
  });

  it('ApiError от onCreate — serverError с деталями, submit возвращает false', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError('Конфликт', 409, 'conflict', ['подробность']));
    const { result } = renderHook(() =>
      useClassForm(null, [], onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('title', 'Занятие');
      result.current.setField('rules', [
        { weekday: 1, time: '19:00', durationMinText: '60' },
      ]);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError).toEqual({
      message: 'Конфликт',
      details: ['подробность'],
    });
  });

  it('создание: активный Telegram-канал отмечен заранее — уходит в onCreate без действий учителя', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const channels = [makeChannel({ id: 'ch1' }), makeChannel({ id: 'ch2', type: 'vk' })];
    const { result } = renderHook(() =>
      useClassForm(null, channels, onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('title', 'Новое занятие');
      result.current.setField('rules', [
        { weekday: 1, time: '19:00', durationMinText: '60' },
      ]);
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ channelIds: ['ch1'] }),
    );
  });

  it('неизвестная ошибка от onCreate — общий текст', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useClassForm(null, [], onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('title', 'Занятие');
      result.current.setField('rules', [
        { weekday: 1, time: '19:00', durationMinText: '60' },
      ]);
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });
});

describe('useClassForm — правка и удаление', () => {
  it('submit существующего занятия вызывает onUpdate с его id', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const cls = makeClass();
    const { result } = renderHook(() =>
      useClassForm(cls, [], vi.fn(), onUpdate, vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ title: 'Тайцзицюань' }),
    );
  });

  it('remove() без выбранного занятия — false, onRemove не вызывается', async () => {
    const onRemove = vi.fn();
    const { result } = renderHook(() =>
      useClassForm(null, [], vi.fn(), vi.fn(), onRemove),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('remove() успешно удаляет занятие по id', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const cls = makeClass();
    const { result } = renderHook(() =>
      useClassForm(cls, [], vi.fn(), vi.fn(), onRemove),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(true);
    expect(onRemove).toHaveBeenCalledWith('c1');
  });

  it('409 при удалении (есть занятия) — serverError с текстом от сервера', async () => {
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Есть запланированные занятия.', 409, 'conflict'));
    const cls = makeClass();
    const { result } = renderHook(() =>
      useClassForm(cls, [], vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe('Есть запланированные занятия.');
  });

  it('неизвестная ошибка при удалении — общий текст', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    const cls = makeClass();
    const { result } = renderHook(() =>
      useClassForm(cls, [], vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось удалить. Попробуйте ещё раз.',
    );
  });
});
