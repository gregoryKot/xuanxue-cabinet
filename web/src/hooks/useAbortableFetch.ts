// Общая логика хуков данных экрана (useClasses/useLessons/useSummary):
// AbortController + сверка id запроса — устаревший ответ (второй reload()
// раньше первого, размонтирование посреди загрузки) не перезаписывает более
// новый (ревью п.13). Раньше эта логика была скопирована в каждый хук по
// отдельности — jscpd-храповик поймал дубль (CLAUDE.md «Дубли и мёртвый код»).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';

export interface UseAbortableFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export interface UseAbortableFetchOptions {
  /** По умолчанию `true`. `false` — хук не запрашивает данные сам при
   * монтировании (например, `usePeople({ enabled: isAdmin })`, ADR-0030:
   * учитель видит `/people`, но список учеников — только admin, и звать
   * `GET /users` от его имени незачем — сервер всё равно ответит 403). */
  enabled?: boolean;
}

/**
 * `load` вызывается заново на каждый `reload()` с актуальным `AbortSignal`;
 * держим последнюю версию в ref, а не в зависимостях `useCallback` — иначе
 * хук вроде `useLessons` (окно `from/to` пересчитывается на каждый вызов)
 * гонял бы лишний `reload` при каждом рендере.
 */
export function useAbortableFetch<T>(
  load: (signal: AbortSignal) => Promise<T>,
  fallbackErrorMessage: string,
  options: UseAbortableFetchOptions = {},
): UseAbortableFetchResult<T> {
  const { enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const thisRequest = (requestId.current += 1);

    setLoading(true);
    setError(null);
    try {
      const result = await loadRef.current(controller.signal);
      if (requestId.current !== thisRequest) return;
      setData(result);
    } catch (err) {
      if (requestId.current !== thisRequest) return;
      setError(err instanceof ApiError ? err.message : fallbackErrorMessage);
    } finally {
      if (requestId.current === thisRequest) setLoading(false);
    }
  }, [fallbackErrorMessage]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return () => abortController.current?.abort();
  }, [reload, enabled]);

  return { data, loading, error, reload };
}
