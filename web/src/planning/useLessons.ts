// Список занятий на окне планирования для экрана «Занятия». Только чтение:
// создание, правку, запись и «отправить сейчас» ведёт страница занятия своим
// `useLessonEditor` (ADR-0033), а список перечитывается сам при возврате на
// него. Гонка запросов и разбор ошибки — в общем useAbortableFetch
// (CLAUDE.md «Одна механика — один компонент», иначе дубль с useClasses/
// useSummary ловит jscpd).
import type { LessonDto } from '@xuanxue/shared';
import { lessonsListPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия. Попробуйте ещё раз.';

export interface UseLessonsResult {
  lessons: LessonDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useLessons(): UseLessonsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<LessonDto[]>(lessonsListPath(), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { lessons: data, loading, error, reload };
}
