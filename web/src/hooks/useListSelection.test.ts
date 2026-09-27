import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useListSelection } from './useListSelection';

describe('useListSelection', () => {
  it('изначально не в режиме выбора, ничего не отмечено', () => {
    const { result } = renderHook(() => useListSelection(['a', 'b']));

    expect(result.current.isSelecting).toBe(false);
    expect(result.current.selectedVisibleIds).toEqual([]);
    expect(result.current.allVisibleSelected).toBe(false);
  });

  it('start() входит в режим выбора с пустым набором отметок', () => {
    const { result } = renderHook(() => useListSelection(['a', 'b']));

    act(() => result.current.start());

    expect(result.current.isSelecting).toBe(true);
    expect(result.current.selectedVisibleIds).toEqual([]);
  });

  it('toggle() отмечает и снимает отметку', () => {
    const { result } = renderHook(() => useListSelection(['a', 'b']));

    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.selectedVisibleIds).toEqual(['a']);

    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.selectedVisibleIds).toEqual([]);
  });

  it('stop() выходит из режима выбора и снимает все отметки', () => {
    const { result } = renderHook(() => useListSelection(['a', 'b']));

    act(() => result.current.toggle('a'));
    act(() => result.current.stop());

    expect(result.current.isSelecting).toBe(false);
    expect(result.current.selectedVisibleIds).toEqual([]);
  });

  it('selectOnly() заменяет отметки на переданный набор', () => {
    const { result } = renderHook(() => useListSelection(['a', 'b', 'c']));

    act(() => result.current.toggle('a'));
    act(() => result.current.selectOnly(['b', 'c']));

    expect(result.current.selectedVisibleIds).toEqual(['b', 'c']);
  });

  it('toggleAllVisible() отмечает все видимые, повторный вызов снимает все', () => {
    const { result } = renderHook(() => useListSelection(['a', 'b']));

    act(() => result.current.toggleAllVisible());
    expect(result.current.selectedVisibleIds).toEqual(['a', 'b']);
    expect(result.current.allVisibleSelected).toBe(true);

    act(() => result.current.toggleAllVisible());
    expect(result.current.selectedVisibleIds).toEqual([]);
    expect(result.current.allVisibleSelected).toBe(false);
  });

  it('отмеченный id, скрытый фильтром, выпадает из selectedVisibleIds', () => {
    const { result, rerender } = renderHook(
      ({ visibleIds }: { visibleIds: string[] }) => useListSelection(visibleIds),
      { initialProps: { visibleIds: ['a', 'b'] } },
    );

    act(() => result.current.toggle('a'));
    expect(result.current.selectedVisibleIds).toEqual(['a']);

    // Фильтр экрана спрятал строку «a» — она больше не visibleIds.
    rerender({ visibleIds: ['b'] });

    expect(result.current.selectedVisibleIds).toEqual([]);
    expect(result.current.isSelected('a')).toBe(true);
  });

  it('allVisibleSelected — false для пустого списка (нечего выбирать)', () => {
    const { result } = renderHook(() => useListSelection([]));

    expect(result.current.allVisibleSelected).toBe(false);
  });
});
