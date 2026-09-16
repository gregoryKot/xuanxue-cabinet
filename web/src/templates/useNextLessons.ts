// Ближайшие занятия для выбора в предпросмотре шаблона (docs/PLAN.md §6
// «Шаблоны») — путь строит nextLessonsPath (api/apiPaths.ts, точная
// арифметика окна — в nextLessonsWindow.ts, pr-k3-fixes.md п.1), первые
// NEXT_LESSONS_LIMIT из уже отсортированного по `startsAt` ответа GET /lessons.
import type { LessonDto } from '@xuanxue/shared';
import { nextLessonsPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия для предпросмотра.';

export interface UseNextLessonsResult {
  lessons: LessonDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useNextLessons(): UseNextLessonsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<LessonDto[]>(nextLessonsPath(), { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { lessons: data, loading, error, reload };
}
