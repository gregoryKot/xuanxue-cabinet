// Список банка вопросов — чтение с фильтром по статусу. Правка и создание
// живут на своей странице со своим хуком (useExamItemEditor.ts, ADR-0033),
// поэтому мутаций здесь больше нет: список читается заново при возврате на
// экран. Поиск по формулировке и тегу — локальный (lib/textSearch.ts).
// Фильтр меняется с экрана, а не переоткрытием — перечитываем список при его
// смене, тот же приём, что у broadcasts/useBroadcasts.ts.
import { useEffect, useRef } from 'react';
import { LIST_LIMIT_MAX, type ExamItemDto, type ExamItemStatus } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить вопросы. Попробуйте ещё раз.';

export interface UseExamItemsResult {
  items: ExamItemDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Пустой статус — «Все». */
function buildListPath(status: ExamItemStatus | ''): string {
  const limit = `limit=${LIST_LIMIT_MAX}`;
  return status ? `/exam-items?${limit}&status=${status}` : `/exam-items?${limit}`;
}

export function useExamItems(status: ExamItemStatus | ''): UseExamItemsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamItemDto[]>(buildListPath(status), { signal }),
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
