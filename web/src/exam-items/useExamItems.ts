// Список вопросов — чтение с фильтром по статусу. Правка и создание
// живут на своей странице со своим хуком (useExamItemEditor.ts, ADR-0033) —
// список читается заново при возврате на экран. Массовое удаление (ADR-0141)
// правит список прямо здесь: `removeFromList` патчит уже загруженные данные
// из ответа `POST /exam-items/bulk-delete`, второй `GET` не нужен (ADR-0087).
// Поиск по формулировке и тегу — локальный (lib/textSearch.ts). Фильтр
// меняется с экрана, а не переоткрытием — перечитываем список при его смене,
// тот же приём, что у broadcasts/useBroadcasts.ts.
import { useEffect, useRef } from 'react';
import type { ExamItemDto, ExamItemStatus } from '@xuanxue/shared';
import { EXAM_EDITOR_ITEMS_QUERY, examItemsListQuery } from '../api/listQueries';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { withoutIds } from '../lib/listPatch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить вопросы. Попробуйте ещё раз.';

export interface UseExamItemsResult {
  items: ExamItemDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  removeFromList: (ids: string[]) => void;
}

export function useExamItems(
  status: ExamItemStatus | '',
  options: { includeDeleted?: boolean } = {},
): UseExamItemsResult {
  // С удалёнными — только редактору и предпросмотру экзамена (ADR-0140), им
  // фильтр статуса не нужен: вопрос ищется по id из формы.
  const query = options.includeDeleted
    ? EXAM_EDITOR_ITEMS_QUERY
    : examItemsListQuery(status);
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /exam-items', { query, signal }),
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

  return {
    items: data,
    loading,
    error,
    reload,
    removeFromList: (ids) => applyData((prev) => withoutIds(prev, ids)),
  };
}
