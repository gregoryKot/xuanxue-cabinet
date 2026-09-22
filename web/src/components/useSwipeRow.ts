// Жест «смахнуть строку списка» (SwipeRow.tsx) — числа, пороги и состояние
// «открыто/закрыто» вынесены сюда, а не в разметку: тестируется без DOM
// (CLAUDE.md «Любой код с логикой приезжает с тестом», уровень «чистая
// логика»). Просьба владельца 2026-09-22: «уведомление нельзя смахнуть,
// удалить» — жест только ускоряет доступ к кнопке действия, она остаётся
// достижима и без него (клавиатура, скринридер — CLAUDE.md «Доступность»).
import { useCallback, useRef, useState } from 'react';
import type { TouchEvent } from 'react';

/** Ширина кнопки под содержимым — она же предел сдвига слоя содержимого
 * влево. 96 — с запасом вмещает подпись «Убрать» на кегле 16 с паддингом по
 * 16px с каждой стороны и не съедает больше четверти строки на экране 360px
 * (CLAUDE.md «Мобильный экран первым»); в макете жеста не было, число выбрано
 * здесь. */
export const SWIPE_BUTTON_WIDTH = 96;

/** Порог «открыто/закрыто» на отпускании — половина ширины кнопки: палец,
 * прошедший больше половины пути, явно вёл строку открывать, меньше —
 * передумал или задел случайно. */
const OPEN_THRESHOLD = SWIPE_BUTTON_WIDTH * 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Point {
  clientX: number;
  clientY: number;
}

function firstTouch(e: TouchEvent): Point | null {
  const touch = e.touches[0];
  return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
}

export interface SwipeRowGesture {
  /** Строка открыта (кнопка видна целиком) — держится и после отпускания
   * пальца, в отличие от `dragging`. */
  open: boolean;
  /** Сдвиг слоя содержимого влево, px, 0..SWIPE_BUTTON_WIDTH. */
  offset: number;
  /** Идёт перетаскивание прямо сейчас — SwipeRow гасит transition на время
   * жеста, иначе слой отстаёт от пальца. */
  dragging: boolean;
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  /** Строка открыта — закрывает её и возвращает `true` (вызывающий гасит
   * клик/переход по ссылке под ней), иначе ничего не делает, возвращает
   * `false`. */
  closeIfOpen: () => boolean;
  /** Открыть без жеста — зовётся на фокусе кнопки «Убрать» с клавиатуры,
   * иначе фокус уезжает на визуально скрытый элемент. */
  openRow: () => void;
}

export function useSwipeRow(disabled = false): SwipeRowGesture {
  const [open, setOpen] = useState(false);
  // null — жест сейчас не идёт; во время перетаскивания держит сдвиг,
  // который следует за пальцем поверх зафиксированного open.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const startRef = useRef<Point | null>(null);
  // Решение «это горизонтальный жест» для текущего касания — принимается
  // один раз в onTouchMove и не пересматривается назад: иначе жест,
  // начавшийся вертикальной прокруткой, а потом свернувший вбок, дёргал бы
  // строку рывком вместо мешать/не мешать прокрутке.
  const horizontalRef = useRef(false);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled) return;
      startRef.current = firstTouch(e);
      horizontalRef.current = false;
    },
    [disabled],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const start = startRef.current;
      const point = start && firstTouch(e);
      if (!start || !point) return;
      const dx = point.clientX - start.clientX;
      const dy = point.clientY - start.clientY;
      // Ведём по горизонтали только если сдвиг по X больше сдвига по Y —
      // иначе это прокрутка страницы, и строку трогать нельзя: список
      // уведомлений листают чаще, чем разбирают.
      if (!horizontalRef.current && Math.abs(dx) <= Math.abs(dy)) return;
      horizontalRef.current = true;
      const base = open ? SWIPE_BUTTON_WIDTH : 0;
      setDragOffset(clamp(base - dx, 0, SWIPE_BUTTON_WIDTH));
    },
    [open],
  );

  const onTouchEnd = useCallback(() => {
    startRef.current = null;
    if (horizontalRef.current && dragOffset !== null) {
      setOpen(dragOffset > OPEN_THRESHOLD);
    }
    horizontalRef.current = false;
    setDragOffset(null);
  }, [dragOffset]);

  const closeIfOpen = useCallback(() => {
    if (!open) return false;
    setOpen(false);
    return true;
  }, [open]);

  const openRow = useCallback(() => setOpen(true), []);

  return {
    open,
    offset: dragOffset ?? (open ? SWIPE_BUTTON_WIDTH : 0),
    dragging: dragOffset !== null,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    closeIfOpen,
    openRow,
  };
}
