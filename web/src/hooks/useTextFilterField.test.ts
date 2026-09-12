import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTextFilterField } from './useTextFilterField';

describe('useTextFilterField', () => {
  it('печатать не вызывает onChange сразу', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextFilterField('', onChange));

    act(() => result.current.setText('ян'));

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.text).toBe('ян');
  });

  it('commit() обрезает пробелы и зовёт onChange, если значение изменилось', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextFilterField('', onChange));

    act(() => result.current.setText('  ян  '));
    act(() => result.current.commit());

    expect(onChange).toHaveBeenCalledWith('ян');
  });

  it('commit() без изменений — onChange не зовётся', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextFilterField('ян', onChange));

    act(() => result.current.commit());

    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter коммитит так же, как commit()', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextFilterField('', onChange));
    act(() => result.current.setText('база'));

    const preventDefault = vi.fn();
    act(() =>
      result.current.handleKeyDown({
        key: 'Enter',
        preventDefault,
      } as unknown as Parameters<typeof result.current.handleKeyDown>[0]),
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('база');
  });

  it('клавиша не Enter — не коммитит', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTextFilterField('', onChange));
    act(() => result.current.setText('база'));

    act(() =>
      result.current.handleKeyDown({
        key: 'a',
        preventDefault: vi.fn(),
      } as unknown as Parameters<typeof result.current.handleKeyDown>[0]),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('внешнее изменение value обновляет текст в поле', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useTextFilterField(value, vi.fn()),
      { initialProps: { value: 'ян' } },
    );
    expect(result.current.text).toBe('ян');

    rerender({ value: '' });

    expect(result.current.text).toBe('');
  });
});
