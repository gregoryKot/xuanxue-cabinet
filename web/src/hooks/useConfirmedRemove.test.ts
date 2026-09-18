// ExamEditorScreen.test.tsx и ExamItemEditorScreen.test.tsx проверяют сборку
// с ConfirmDialog на живой странице; здесь — сама механика хука без
// React-дерева вокруг, по образцу hooks/useEntityForm.test.ts.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConfirmedRemove } from './useConfirmedRemove';

describe('useConfirmedRemove', () => {
  it('requestRemove открывает подтверждение, remove() ещё не вызван', () => {
    const remove = vi.fn();
    const goBack = vi.fn();
    const { result } = renderHook(() => useConfirmedRemove(remove, goBack));

    act(() => result.current.requestRemove());

    expect(result.current.confirming).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('cancelRemove закрывает подтверждение, ничего не удаляет, лист не закрывается', () => {
    const remove = vi.fn();
    const goBack = vi.fn();
    const { result } = renderHook(() => useConfirmedRemove(remove, goBack));

    act(() => result.current.requestRemove());
    act(() => result.current.cancelRemove());

    expect(result.current.confirming).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  // Страница создания (SimpleEditorForm без `remove`): удалять ещё нечего,
  // кнопки нет — но хук в дереве стоит всегда (правила хуков).
  it('remove не задан — confirmRemove ничего не делает и лист не закрывается', async () => {
    const goBack = vi.fn();
    const { result } = renderHook(() => useConfirmedRemove(undefined, goBack));

    await act(async () => {
      await result.current.confirmRemove();
    });

    expect(goBack).not.toHaveBeenCalled();
  });

  it('confirmRemove успешный — remove() вызван, лист закрывается одним goBack() после закрытия диалога', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const goBack = vi.fn();
    const { result } = renderHook(() => useConfirmedRemove(remove, goBack));

    act(() => result.current.requestRemove());
    await act(async () => {
      await result.current.confirmRemove();
    });

    expect(remove).toHaveBeenCalledTimes(1);
    // Сущность удалена, но диалог подтверждения ещё открыт (ConfirmDialog
    // закроет себя сам) — весь лист ещё не должен закрываться.
    expect(goBack).not.toHaveBeenCalled();

    // ConfirmDialog закрывается сам после onConfirm — здесь это cancelRemove().
    act(() => result.current.cancelRemove());

    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('confirmRemove упавший — remove() вызван, лист не закрывается даже после закрытия диалога', async () => {
    const remove = vi.fn().mockResolvedValue(false);
    const goBack = vi.fn();
    const { result } = renderHook(() => useConfirmedRemove(remove, goBack));

    act(() => result.current.requestRemove());
    await act(async () => {
      await result.current.confirmRemove();
    });
    act(() => result.current.cancelRemove());

    expect(remove).toHaveBeenCalledTimes(1);
    expect(goBack).not.toHaveBeenCalled();
  });
});
