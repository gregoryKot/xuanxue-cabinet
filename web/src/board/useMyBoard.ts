// Данные доски ученика — GET /me/board (ADR-0172): объявление школы. Read-only,
// гонку запросов и разбор ошибки даёт общий useAbortableFetch. Путь собран в
// apiPaths.ts (MY_BOARD_PATH) для предзагрузки первого экрана: ключ кэша
// prefetchCache.ts и запрос хука обязаны совпасть.
import type { MyBoardDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import {
  useAbortableFetch,
  type UseAbortableFetchOptions,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить объявление школы. Попробуйте ещё раз.';

/** `enabled: false` — запрос не уходит: плитку скрыли на главной (ADR-0179). */
export function useMyBoard(
  options: UseAbortableFetchOptions,
): UseAbortableFetchResult<MyBoardDto> {
  return useAbortableFetch(
    (signal) => apiRoute('GET /me/board', { signal }),
    LOAD_ERROR_MESSAGE,
    options,
  );
}
