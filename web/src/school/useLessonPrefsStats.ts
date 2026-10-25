// Число для школы к меню уведомлений (ADR-0185) — три числа одним
// запросом `GET /notifications/lesson-prefs-stats`. Только для штата: экран
// «Шаблоны» штатный, а контроллер ещё и закрыт ролью. Строку из чисел собирает
// formatLessonPrefsStats (lessonPrefsStatsText.ts).
import type { LessonPrefsStatsDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить, сколько учеников отметили занятия. Обновите страницу.';

export interface UseLessonPrefsStatsResult {
  stats: LessonPrefsStatsDto | null;
  loading: boolean;
  error: string | null;
}

export function useLessonPrefsStats(): UseLessonPrefsStatsResult {
  const { data, loading, error } = useAbortableFetch(
    (signal) => apiRoute('GET /notifications/lesson-prefs-stats', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { stats: data, loading, error };
}
