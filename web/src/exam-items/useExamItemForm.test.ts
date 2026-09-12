// Валидация и сборка тела запроса — в examItemFormInput.test.ts (чистая
// логика, без хука). Здесь — только оркестрация: submit/remove/changeStatus
// вызывают правильный колбэк и правильно репортят ошибку, по образцу
// schedule/useClassForm.test.ts.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useExamItemForm } from './useExamItemForm';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'text',
    prompt: 'Вопрос',
    options: [],
    tags: [],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useExamItemForm — создание', () => {
  it('пустая формулировка — submit не вызывает onCreate, есть validationError', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() =>
      useExamItemForm(null, onCreate, vi.fn(), vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onCreate).not.toHaveBeenCalled();
    expect(result.current.validationError).toMatch(/формулировку/);
  });

  it('успешный submit — вызывает onCreate с телом из состояния', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExamItemForm(null, onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('prompt', '  Вопрос  ');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Вопрос' }));
  });

  it('ApiError от onCreate — serverError с деталями, submit возвращает false', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError('Конфликт', 409, 'conflict', ['подробность']));
    const { result } = renderHook(() =>
      useExamItemForm(null, onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('prompt', 'Вопрос');
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

  it('неизвестная ошибка от onCreate — общий текст', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useExamItemForm(null, onCreate, vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.setField('prompt', 'Вопрос');
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });
});

describe('useExamItemForm — правка, удаление, смена статуса', () => {
  it('submit существующего вопроса вызывает onUpdate с его id', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const item = makeItem();
    const { result } = renderHook(() =>
      useExamItemForm(item, vi.fn(), onUpdate, vi.fn()),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onUpdate).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ prompt: 'Вопрос' }),
    );
  });

  it('remove() без выбранного вопроса — false, onRemove не вызывается', async () => {
    const onRemove = vi.fn();
    const { result } = renderHook(() =>
      useExamItemForm(null, vi.fn(), vi.fn(), onRemove),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('remove() успешно удаляет вопрос по id', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const item = makeItem();
    const { result } = renderHook(() =>
      useExamItemForm(item, vi.fn(), vi.fn(), onRemove),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(true);
    expect(onRemove).toHaveBeenCalledWith('e1');
  });

  it('409 при удалении (не черновик) — serverError с текстом от сервера', async () => {
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Удалить можно только черновик.', 409, 'conflict'));
    const item = makeItem();
    const { result } = renderHook(() =>
      useExamItemForm(item, vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe('Удалить можно только черновик.');
  });

  it('неизвестная ошибка при удалении — общий текст', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    const item = makeItem();
    const { result } = renderHook(() =>
      useExamItemForm(item, vi.fn(), vi.fn(), onRemove),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось удалить. Попробуйте ещё раз.',
    );
  });

  it('changeStatus() без выбранного вопроса — false, onUpdate не вызывается', async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() =>
      useExamItemForm(null, vi.fn(), onUpdate, vi.fn()),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('changeStatus() шлёт только status, не поля формы', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const item = makeItem();
    const { result } = renderHook(() =>
      useExamItemForm(item, vi.fn(), onUpdate, vi.fn()),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith('e1', { status: 'published' });
  });

  it('ошибка changeStatus() — общий текст в serverError', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    const item = makeItem();
    const { result } = renderHook(() =>
      useExamItemForm(item, vi.fn(), onUpdate, vi.fn()),
    );

    await act(async () => {
      await result.current.changeStatus('archived');
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось изменить статус. Попробуйте ещё раз.',
    );
  });
});
