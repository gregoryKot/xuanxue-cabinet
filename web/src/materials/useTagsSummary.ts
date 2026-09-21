// Сводка тегов школы (GET /api/tags, ADR-0075/0078) — список тегов с двумя
// числами у каждого: сколько дат занятий и сколько материалов, по всей
// истории школы, без окна. Только чтение, по образцу schedule/useClasses.ts
// — гонка запросов и разбор ошибки в общем useAbortableFetch (CLAUDE.md
// «Одна механика — один компонент»); тест этой гонки —
// hooks/useAbortableFetch.test.ts, здесь незачем повторять.
import type { TagSummaryDto } from '@xuanxue/shared';
import { TAGS_LIST_PATH } from '../api/tagsApiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить теги. Попробуйте ещё раз.';

export interface UseTagsSummaryResult {
  tags: TagSummaryDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useTagsSummary(): UseTagsSummaryResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<TagSummaryDto[]>(TAGS_LIST_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { tags: data, loading, error, reload };
}
