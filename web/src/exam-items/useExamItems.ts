// Список вопросов — чтение с фильтром по статусу. Правка и создание
// живут на своей странице со своим хуком (useExamItemEditor.ts, ADR-0033),
// поэтому мутаций здесь больше нет: список читается заново при возврате на
// экран. Поиск по формулировке и тегу — локальный (lib/textSearch.ts).
// Фильтр меняется с экрана, а не переоткрытием — перечитываем список при его
// смене, тот же приём, что у broadcasts/useBroadcasts.ts.
import { useEffect, useRef } from 'react';
import type { ExamItemDto, ExamItemStatus } from '@xuanxue/shared';
import { EXAM_EDITOR_ITEMS_PATH, examItemsListPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить вопросы. Попробуйте ещё раз.';

export interface UseExamItemsResult {
  items: ExamItemDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExamItems(
  status: ExamItemStatus | '',
  options: { includeDeleted?: boolean } = {},
): UseExamItemsResult {
  // С удалёнными — только редактору и предпросмотру экзамена (ADR-0140), им
  // фильтр статуса не нужен: вопрос ищется по id из формы.
  const path = options.includeDeleted
    ? EXAM_EDITOR_ITEMS_PATH
    : examItemsListPath(status);
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamItemDto[]>(path, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // useAbortableFetch сам перечитывает только по явному reload() — первый
  // рендер уже сделал запрос сам, этот эффект реагирует только на смену
  // фильтра после монтирования (pr-k3-fixes.md п.17 у useBroadcasts.ts).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [status, reload]);

  return { items: data, loading, error, reload };
}
