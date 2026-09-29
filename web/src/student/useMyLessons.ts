// Данные экрана ученика — ближайшие занятия школы, GET /me/lessons
// (docs/PLAN.md §11, слой 4.1). Read-only: мутаций нет, гонка запросов и
// разбор ошибки — общий hooks/useAbortableFetch.ts, по образцу
// people/useTeachers.ts. Лимит не передаём — сервис сам берёт
// MY_LESSONS_LIMIT_DEFAULT, когда query пуст (ListMyLessonsDto).
import type { MyLessonDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить ближайшие занятия. Попробуйте ещё раз.';

export function useMyLessons(): UseAbortableFetchResult<MyLessonDto[]> {
  return useAbortableFetch(
    (signal) => apiRoute('GET /me/lessons', { signal }),
    LOAD_ERROR_MESSAGE,
  );
}
