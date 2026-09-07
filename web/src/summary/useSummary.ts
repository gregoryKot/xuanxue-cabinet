// Данные экрана «Сводка» — GET /summary, без мутаций (экран только читает).
// Гонка запросов и разбор ошибки — в общем useAbortableFetch (CLAUDE.md
// «Одна механика — один компонент», иначе дубль с useClasses/useLessons ловит
// jscpd).
import type { SummaryDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить сводку. Попробуйте ещё раз.';

export interface UseSummaryResult {
  summary: SummaryDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useSummary(): UseSummaryResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<SummaryDto>('/summary', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { summary: data, loading, error, reload };
}
