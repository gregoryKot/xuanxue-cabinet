import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOptionInputFocus } from './useOptionInputFocus';

// Спай — отдельная переменная, не `input.focus`: eslint (unbound-method)
// иначе решает, что это метод класса, оторванный от объекта, хотя на деле
// это мок-функция vi.fn().
function fakeInput(): { input: HTMLInputElement; focus: ReturnType<typeof vi.fn> } {
  const focus = vi.fn();
  return { input: { focus } as unknown as HTMLInputElement, focus };
}

describe('useOptionInputFocus — markFocusNext', () => {
  it('рост длины после markFocusNext — фокусирует последний зарегистрированный input', () => {
    const { result, rerender } = renderHook(({ length }) => useOptionInputFocus(length), {
      initialProps: { length: 1 },
    });
    const zero = fakeInput();
    const one = fakeInput();
    act(() => result.current.registerInput(0)(zero.input));

    act(() => result.current.markFocusNext());
    act(() => result.current.registerInput(1)(one.input));
    act(() => rerender({ length: 2 }));

    expect(one.focus).toHaveBeenCalledTimes(1);
    expect(zero.focus).not.toHaveBeenCalled();
  });

  it('рост длины без markFocusNext — фокус никуда не переводится', () => {
    const { result, rerender } = renderHook(({ length }) => useOptionInputFocus(length), {
      initialProps: { length: 1 },
    });
    const one = fakeInput();
    act(() => result.current.registerInput(1)(one.input));

    act(() => rerender({ length: 2 }));

    expect(one.focus).not.toHaveBeenCalled();
  });

  it('флаг разряжается — второй рост длины без нового markFocusNext не фокусирует', () => {
    const { result, rerender } = renderHook(({ length }) => useOptionInputFocus(length), {
      initialProps: { length: 1 },
    });
    const one = fakeInput();
    const two = fakeInput();
    act(() => result.current.registerInput(1)(one.input));
    act(() => result.current.registerInput(2)(two.input));

    act(() => result.current.markFocusNext());
    act(() => rerender({ length: 2 }));
    act(() => rerender({ length: 3 }));

    expect(one.focus).toHaveBeenCalledTimes(1);
    expect(two.focus).not.toHaveBeenCalled();
  });
});

describe('useOptionInputFocus — focusIndex', () => {
  it('фокусирует зарегистрированный input по индексу напрямую', () => {
    const { result } = renderHook(() => useOptionInputFocus(2));
    const one = fakeInput();
    act(() => result.current.registerInput(1)(one.input));

    act(() => result.current.focusIndex(1));

    expect(one.focus).toHaveBeenCalledTimes(1);
  });

  it('незарегистрированный индекс — не падает', () => {
    const { result } = renderHook(() => useOptionInputFocus(2));

    expect(() => result.current.focusIndex(5)).not.toThrow();
  });
});
