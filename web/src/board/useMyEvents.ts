// События для доски ученика — GET /me/events (ADR-0177): предстоящие и
// идущие, ближайшие сверху, не больше двадцати. Read-only, гонку запросов и
// разбор ошибки даёт общий useAbortableFetch. Путь MY_EVENTS_PATH собран в
// eventsApiPaths.ts для предзагрузки первого экрана.
import type { SchoolEventDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить события школы. Попробуйте ещё раз.';

export function useMyEvents(): UseAbortableFetchResult<SchoolEventDto[]> {
  return useAbortableFetch(
    (signal) => apiRoute('GET /me/events', { signal }),
    LOAD_ERROR_MESSAGE,
  );
}
