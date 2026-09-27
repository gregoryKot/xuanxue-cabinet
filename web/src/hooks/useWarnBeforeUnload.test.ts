import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWarnBeforeUnload } from './useWarnBeforeUnload';

describe('useWarnBeforeUnload', () => {
  it('active — регистрирует beforeunload, событие ставит returnValue', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useWarnBeforeUnload(true));

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    const handler = addSpy.mock.calls[0]?.[1] as (e: Event) => void;
    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: '' } as unknown as BeforeUnloadEvent;

    handler(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe('');
    addSpy.mockRestore();
  });

  it('active: false — слушатель не ставится', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useWarnBeforeUnload(false));

    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addSpy.mockRestore();
  });

  it('переход active true → false снимает слушатель', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(({ active }) => useWarnBeforeUnload(active), {
      initialProps: { active: true },
    });

    rerender({ active: false });

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('размонтирование во время active — снимает слушатель', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useWarnBeforeUnload(true));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeSpy.mockRestore();
  });
});
