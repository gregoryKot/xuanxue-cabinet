// Данные экрана ученика — ближайшие занятия школы, GET /me/lessons
// (docs/PLAN.md §11, слой 4.1). Read-only: мутаций нет, гонка запросов и
// разбор ошибки — общий hooks/useAbortableFetch.ts, по образцу
// people/useTeachers.ts. Лимит не передаём — сервис сам берёт
// MY_LESSONS_LIMIT_DEFAULT, когда query пуст (ListMyLessonsDto).
import type { MyLessonDto } from '@xuanxue/shared';
import { MY_LESSONS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить ближайшие занятия. Попробуйте ещё раз.';

export function useMyLessons(): UseAbortableFetchResult<MyLessonDto[]> {
  return useAbortableFetch(
    (signal) => apiFetch<MyLessonDto[]>(MY_LESSONS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
}
