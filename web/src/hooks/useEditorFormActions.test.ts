// Механика «успех уводит на список, провал прокручивает к ошибке» плюс
// подключение подтверждения удаления — здесь, без DOM-дерева редактора;
// собственно диалог подтверждения проверен в useConfirmedRemove.test.ts,
// здесь — только то, что useEditorFormActions вызывает его с нужными
// аргументами. Сборка на живой странице — в ExamItemEditorScreen.test.tsx и
// ExamEditorScreen.test.tsx.
import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToFirstAlertSoon } from '../lib/scrollToFirstAlert';
import { useEditorFormActions } from './useEditorFormActions';

vi.mock('../lib/scrollToFirstAlert', () => ({ scrollToFirstAlertSoon: vi.fn() }));

// Отдельная переменная под мок, не `event.preventDefault` в expect(...) —
// иначе `@typescript-eslint/unbound-method` ругается на несвязанный метод
// (по образцу hooks/useScrollToHash.test.tsx).
function fakeEvent(preventDefault = vi.fn()) {
  return { event: { preventDefault } as unknown as FormEvent, preventDefault };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEditorFormActions — handleSubmit', () => {
  it('успех — preventDefault(), уход на список, без прокрутки к ошибке', async () => {
    const submit = vi.fn().mockResolvedValue(true);
    const goToList = vi.fn();
    const { event, preventDefault } = fakeEvent();
    const { result } = renderHook(() =>
      useEditorFormActions(submit, vi.fn(), vi.fn(), goToList),
    );

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(goToList).toHaveBeenCalledTimes(1);
    expect(scrollToFirstAlertSoon).not.toHaveBeenCalled();
  });

  it('провал — на список не уходит, зовёт прокрутку к ошибке', async () => {
    const submit = vi.fn().mockResolvedValue(false);
    const goToList = vi.fn();
    const { result } = renderHook(() =>
      useEditorFormActions(submit, vi.fn(), vi.fn(), goToList),
    );

    await act(async () => {
      await result.current.handleSubmit(fakeEvent().event);
    });

    expect(goToList).not.toHaveBeenCalled();
    expect(scrollToFirstAlertSoon).toHaveBeenCalledWith(result.current.formRef.current);
  });
});

describe('useEditorFormActions — handleChangeStatus', () => {
  it('успех — уходит на список с тем же статусом', async () => {
    const changeStatus = vi.fn().mockResolvedValue(true);
    const goToList = vi.fn();
    const { result } = renderHook(() =>
      useEditorFormActions(vi.fn(), changeStatus, vi.fn(), goToList),
    );

    await act(async () => {
      await result.current.handleChangeStatus('published');
    });

    expect(changeStatus).toHaveBeenCalledWith('published');
    expect(goToList).toHaveBeenCalledTimes(1);
  });

  it('провал — прокручивает к ошибке, на список не уходит', async () => {
    const changeStatus = vi.fn().mockResolvedValue(false);
    const goToList = vi.fn();
    const { result } = renderHook(() =>
      useEditorFormActions(vi.fn(), changeStatus, vi.fn(), goToList),
    );

    await act(async () => {
      await result.current.handleChangeStatus('archived');
    });

    expect(goToList).not.toHaveBeenCalled();
    expect(scrollToFirstAlertSoon).toHaveBeenCalledTimes(1);
  });
});

describe('useEditorFormActions — removeConfirm', () => {
  it('успешное подтверждение удаления уводит на список', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const goToList = vi.fn();
    const { result } = renderHook(() =>
      useEditorFormActions(vi.fn(), vi.fn(), remove, goToList),
    );

    act(() => result.current.removeConfirm.requestRemove());
    await act(async () => {
      await result.current.removeConfirm.confirmRemove();
    });
    act(() => result.current.removeConfirm.cancelRemove());

    expect(remove).toHaveBeenCalledTimes(1);
    expect(goToList).toHaveBeenCalledTimes(1);
  });
});
