// Даты занятий с тегом (GET /api/lessons?tag=, ADR-0075/0078) — для секции
// «Даты занятий» экрана тега. Хук монтируется, только когда тег выбран, и с
// новым `key` на смену тега (MaterialsTagsScreen.tsx → TagLessonsSection.tsx):
// новый выбор тега — это новый экземпляр компонента и свежий запрос через
// обычный эффект монтирования useAbortableFetch, а не ручной reload по смене
// фильтра на месте (в отличие от materials/useMaterials.ts, где фильтры
// живут на одном и том же смонтированном экране).
import type { LessonDto } from '@xuanxue/shared';
import { lessonsByTagPath } from '../api/tagsApiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить занятия с этим тегом. Попробуйте ещё раз.';

export interface UseLessonsByTagResult {
  lessons: LessonDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useLessonsByTag(tag: string): UseLessonsByTagResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<LessonDto[]>(lessonsByTagPath(tag), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { lessons: data, loading, error, reload };
}
