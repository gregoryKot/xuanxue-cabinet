// Данные экрана «Сбои» (`/dev/errors`, ADR-0132, только admin) — список
// последних записей журнала плюс число за 24 часа. Фильтр по коду
// обращения — на сервере (`requestId` в query, DevErrorsScreen.tsx
// передаёт уже очищенный от пробелов текст); фильтр «скрыть недогруженный
// код экрана» — на клиенте, из ответа сервера ничего не убирается.
import { useEffect, useRef } from 'react';
import type { AppErrorListDto } from '@xuanxue/shared';
import { devErrorsListPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить журнал сбоев. Попробуйте ещё раз.';

export interface UseDevErrorsResult {
  data: AppErrorListDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useDevErrors(requestId: string): UseDevErrorsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<AppErrorListDto>(devErrorsListPath(requestId), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // Как useExams.ts: первый рендер уже сделал запрос сам, этот эффект
  // перечитывает список только на смену кода обращения после монтирования.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [requestId, reload]);

  return { data, loading, error, reload };
}
