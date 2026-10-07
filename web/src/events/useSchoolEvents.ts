// Список событий школы для штата — GET /events (ADR-0177). Read-only: запись
// идёт со страницы события (useEventEditor.ts), доска после неё монтируется
// заново и читает свежий список. Путь SCHOOL_EVENTS_PATH собран в
// eventsApiPaths.ts для предзагрузки: ключ кэша и запрос хука обязаны совпасть.
import type { SchoolEventDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить события. Попробуйте ещё раз.';

export function useSchoolEvents(): UseAbortableFetchResult<SchoolEventDto[]> {
  return useAbortableFetch(
    (signal) => apiRoute('GET /events', { signal }),
    LOAD_ERROR_MESSAGE,
  );
}
