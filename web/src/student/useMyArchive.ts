// Данные экрана «Записи занятий» — GET /me/lessons/archive (docs/PLAN.md
// §14, слой 3.3). Read-only, тот же приём, что у useMyLessons.ts: лимит не
// передаём, сервис сам берёт MY_ARCHIVE_LIMIT_DEFAULT, когда query пуст
// (ListMyArchivedLessonsDto).
import type { MyArchivedLessonDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить записи занятий. Попробуйте ещё раз.';

export function useMyArchive(): UseAbortableFetchResult<MyArchivedLessonDto[]> {
  return useAbortableFetch(
    (signal) => apiRoute('GET /me/lessons/archive', { signal }),
    LOAD_ERROR_MESSAGE,
  );
}
