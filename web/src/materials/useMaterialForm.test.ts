// Оркестрация страницы материала — по образцу channels/useChannelForm.test.ts.
// Механика submit/remove/ошибки — общий hooks/useValidatedEntityForm.ts,
// здесь проверяется только конфигурация под домен материала.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useMaterialForm } from './useMaterialForm';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useMaterialForm — submit()', () => {
  it('невалидная форма — validationError, onCreate не зовётся', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() =>
      useMaterialForm(null, onCreate, vi.fn(), vi.fn()),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.validationError?.field).toBe('title');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('создание — валидная форма зовёт onCreate с собранным телом', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMaterialForm(null, onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('title', 'Ван Пэйшэн — форма 24');
      result.current.setField('url', 'https://example.com/book');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Ван Пэйшэн — форма 24',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [],
      access: 'all',
    });
  });

  it('правка — onUpdate по id материала', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMaterialForm(makeMaterial(), vi.fn(), onUpdate, vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onUpdate).toHaveBeenCalledWith('m1', {
      title: 'Ван Пэйшэн — форма 24',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [],
      access: 'all',
    });
  });

  it('ApiError при сохранении — serverError с текстом сервера', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError('Проверьте поля.', 400, 'invalid_input'));
    const { result } = renderHook(() =>
      useMaterialForm(null, onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('title', 'Название');
      result.current.setField('url', 'https://example.com');
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.message).toBe('Проверьте поля.');
  });
});

describe('useMaterialForm — remove()', () => {
  it('без выбранного материала — false, onRemove не вызывается', async () => {
    const onRemove = vi.fn();
    const { result } = renderHook(() =>
      useMaterialForm(null, vi.fn(), vi.fn(), onRemove),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('успешно удаляет материал по id', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMaterialForm(makeMaterial(), vi.fn(), vi.fn(), onRemove),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(true);
    expect(onRemove).toHaveBeenCalledWith('m1');
  });

  it('сбой удаления — общий текст ошибки', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useMaterialForm(makeMaterial(), vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось удалить. Попробуйте ещё раз.',
    );
  });
});
