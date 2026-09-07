// Ближайшие занятия для выбора в предпросмотре шаблона (docs/PLAN.md §6
// «Шаблоны») — окно строит nextLessonsWindow.ts (точная арифметика в UTC,
// pr-k3-fixes.md п.1), первые NEXT_LESSONS_LIMIT из уже отсортированного по
// `startsAt` ответа `GET /lessons`.
import type { LessonDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { nextLessonsWindow } from './nextLessonsWindow';

const NEXT_LESSONS_LIMIT = 5;

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия для предпросмотра.';

export interface UseNextLessonsResult {
  lessons: LessonDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useNextLessons(): UseNextLessonsResult {
  const { data, loading, error, reload } = useAbortableFetch((signal) => {
    const { from, to } = nextLessonsWindow();
    return apiFetch<LessonDto[]>(
      `/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${NEXT_LESSONS_LIMIT}`,
      { signal },
    );
  }, LOAD_ERROR_MESSAGE);
  return { lessons: data, loading, error, reload };
}
