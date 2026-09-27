// Чистое состояние выбора строк списка — режим «выбрать», отмеченные id,
// «выбрать все» (CLAUDE.md «Одна механика — один компонент»): массовое
// удаление вопросов и экзаменов (ADR-0141) устроено одинаково, второй список
// (материалы, каналы) подключает тот же хук, а не копирует состояние.
//
// `visibleIds` приходит параметром хука, а не читается из состояния: фильтр
// и поиск экрана прячут часть строк, отмеченный id может стать невидимым
// (сняли фильтр статуса) — `selectedVisibleIds` отдаёт только то, что
// человек видит прямо сейчас, и `useBulkDelete.ts` удаляет ровно это,
// никогда не то, что спрятано фильтром.
import { useMemo, useState } from 'react';

export interface UseListSelectionResult {
  isSelecting: boolean;
  /** Входит в режим выбора — начинается с пустого набора отметок. */
  start: () => void;
  /** Выходит из режима выбора и снимает все отметки. */
  stop: () => void;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Заменяет отметки на переданный набор — после частичного удаления
   * остаются отмечены только записи, которые не удалились (useBulkDelete.ts). */
  selectOnly: (ids: readonly string[]) => void;
  /** Отмеченные id среди `visibleIds` — то, что человек видит и может снять
   * отметку сам; невидимый отмеченный id (был скрыт фильтром уже после
   * отметки) сюда не попадает. */
  selectedVisibleIds: string[];
  /** Все видимые строки отмечены — определяет подпись «Выбрать все»/«Снять все». */
  allVisibleSelected: boolean;
  /** Отмечает все видимые строки или снимает отметку со всех — по `allVisibleSelected`. */
  toggleAllVisible: () => void;
}

export function useListSelection(visibleIds: readonly string[]): UseListSelectionResult {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const selectedVisibleIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
    isSelecting,
    start: () => {
      setSelected(new Set());
      setIsSelecting(true);
    },
    stop: () => {
      setIsSelecting(false);
      setSelected(new Set());
    },
    isSelected: (id) => selected.has(id),
    toggle,
    selectOnly: (ids) => setSelected(new Set(ids)),
    selectedVisibleIds,
    allVisibleSelected,
    toggleAllVisible: () =>
      setSelected(allVisibleSelected ? new Set() : new Set(visibleIds)),
  };
}
