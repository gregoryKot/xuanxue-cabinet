// Жест SwipeRow.tsx — чистая логика без DOM (CLAUDE.md «Любой код с логикой
// приезжает с тестом», уровень «чистая логика»). Просьба владельца
// 2026-09-22: «уведомление нельзя смахнуть, удалить» — открытие/закрытие по
// порогу, вертикальный жест строку не трогает, сдвиг не выходит за ширину
// кнопки. Доступность и разметка — SwipeRow.test.tsx.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TouchEvent } from 'react';
import { SWIPE_BUTTON_WIDTH, useSwipeRow } from './useSwipeRow';

/** Фейковое касание — хук читает только `touches[0].clientX/clientY`
 * (см. useSwipeRow.ts, firstTouch), остальные поля TouchEvent тесту не нужны. */
function touch(clientX: number, clientY: number): TouchEvent {
  return { touches: [{ clientX, clientY }] } as unknown as TouchEvent;
}

describe('useSwipeRow — начальное состояние', () => {
  it('закрыта, сдвига нет, перетаскивание не идёт', () => {
    const { result } = renderHook(() => useSwipeRow());

    expect(result.current.open).toBe(false);
    expect(result.current.offset).toBe(0);
    expect(result.current.dragging).toBe(false);
  });
});

describe('useSwipeRow — вертикальный жест', () => {
  it('|dy| >= |dx| — строку не двигаем и не открываем на отпускании', () => {
    const { result } = renderHook(() => useSwipeRow());

    act(() => result.current.onTouchStart(touch(100, 100)));
    act(() => result.current.onTouchMove(touch(110, 160))); // dx=10, dy=60
    expect(result.current.offset).toBe(0);
    expect(result.current.dragging).toBe(false);

    act(() => result.current.onTouchEnd());
    expect(result.current.open).toBe(false);
  });
});

describe('useSwipeRow — порог открытия (половина ширины кнопки)', () => {
  it('сдвиг больше половины — на отпускании строка открыта, сдвиг равен ширине кнопки', () => {
    const { result } = renderHook(() => useSwipeRow());

    act(() => result.current.onTouchStart(touch(300, 100)));
    act(() => result.current.onTouchMove(touch(300 - SWIPE_BUTTON_WIDTH * 0.7, 100)));
    expect(result.current.dragging).toBe(true);

    act(() => result.current.onTouchEnd());
    expect(result.current.open).toBe(true);
    expect(result.current.offset).toBe(SWIPE_BUTTON_WIDTH);
    expect(result.current.dragging).toBe(false);
  });

  it('сдвиг меньше половины — на отпускании строка закрыта, сдвиг обнулён', () => {
    const { result } = renderHook(() => useSwipeRow());

    act(() => result.current.onTouchStart(touch(300, 100)));
    act(() => result.current.onTouchMove(touch(300 - SWIPE_BUTTON_WIDTH * 0.3, 100)));
    act(() => result.current.onTouchEnd());

    expect(result.current.open).toBe(false);
    expect(result.current.offset).toBe(0);
  });

  it('открытую строку можно докрыть жестом вправо меньше половины оставшегося', () => {
    const { result } = renderHook(() => useSwipeRow());
    act(() => result.current.onTouchStart(touch(300, 100)));
    act(() => result.current.onTouchMove(touch(300 - SWIPE_BUTTON_WIDTH, 100)));
    act(() => result.current.onTouchEnd());
    expect(result.current.open).toBe(true);

    // Из открытого положения тащим вправо на 0.6 ширины кнопки — остаток
    // (0.4 ширины) меньше порога открытия, строка обязана закрыться, а не
    // остаться открытой из-за того, что жест начался из открытого состояния.
    act(() => result.current.onTouchStart(touch(300, 100)));
    act(() => result.current.onTouchMove(touch(300 + SWIPE_BUTTON_WIDTH * 0.6, 100)));
    act(() => result.current.onTouchEnd());

    expect(result.current.open).toBe(false);
  });
});

describe('useSwipeRow — сдвиг ограничен шириной кнопки', () => {
  it('жест дальше ширины кнопки не сдвигает строку больше SWIPE_BUTTON_WIDTH', () => {
    const { result } = renderHook(() => useSwipeRow());

    act(() => result.current.onTouchStart(touch(500, 100)));
    act(() => result.current.onTouchMove(touch(500 - SWIPE_BUTTON_WIDTH * 3, 100)));

    expect(result.current.offset).toBe(SWIPE_BUTTON_WIDTH);
  });

  it('сдвиг не уходит в отрицательный (только влево)', () => {
    const { result } = renderHook(() => useSwipeRow());

    // Закрытая строка, потянутая вправо — офсет не должен стать отрицательным.
    act(() => result.current.onTouchStart(touch(100, 100)));
    act(() => result.current.onTouchMove(touch(100 + SWIPE_BUTTON_WIDTH, 100)));

    expect(result.current.offset).toBe(0);
  });
});

describe('useSwipeRow — closeIfOpen/openRow (доступ без жеста)', () => {
  it('openRow открывает строку без касания', () => {
    const { result } = renderHook(() => useSwipeRow());

    act(() => result.current.openRow());

    expect(result.current.open).toBe(true);
    expect(result.current.offset).toBe(SWIPE_BUTTON_WIDTH);
  });

  it('closeIfOpen на открытой строке закрывает её и возвращает true', () => {
    const { result } = renderHook(() => useSwipeRow());
    act(() => result.current.openRow());

    let closed = false;
    act(() => {
      closed = result.current.closeIfOpen();
    });

    expect(closed).toBe(true);
    expect(result.current.open).toBe(false);
  });

  it('closeIfOpen на закрытой строке ничего не делает и возвращает false', () => {
    const { result } = renderHook(() => useSwipeRow());

    let closed = true;
    act(() => {
      closed = result.current.closeIfOpen();
    });

    expect(closed).toBe(false);
    expect(result.current.open).toBe(false);
  });
});

describe('useSwipeRow — disabled', () => {
  it('жест не начинается, пока disabled', () => {
    const { result } = renderHook(() => useSwipeRow(true));

    act(() => result.current.onTouchStart(touch(300, 100)));
    act(() => result.current.onTouchMove(touch(300 - SWIPE_BUTTON_WIDTH, 100)));

    expect(result.current.offset).toBe(0);
    expect(result.current.dragging).toBe(false);
  });
});
