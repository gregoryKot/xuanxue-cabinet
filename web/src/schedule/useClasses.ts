// Список занятий расписания для сетки «Расписания» и для страницы занятия
// (LessonEditorScreen.tsx — из какого занятия расписания разовое занятие).
// Только чтение: создание, правку и удаление ведёт страница занятия своим
// `useClassEditor` (ADR-0033). Гонка запросов и разбор ошибки — в общем
// useAbortableFetch (используется также useLessons/useSummary — иначе jscpd
// ловит дубль AbortController + сверки id запроса).
import { LIST_LIMIT_MAX, type ClassDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить расписание. Попробуйте ещё раз.';

export interface UseClassesResult {
  classes: ClassDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useClasses(): UseClassesResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ClassDto[]>(`/classes?limit=${LIST_LIMIT_MAX}`, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { classes: data, loading, error, reload };
}
