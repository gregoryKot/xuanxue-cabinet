// Общая логика хуков данных экрана (useClasses/useLessons/useSummary):
// AbortController + сверка id запроса — устаревший ответ (второй reload()
// раньше первого, размонтирование посреди загрузки) не перезаписывает более
// новый (ревью п.13). Раньше эта логика была скопирована в каждый хук по
// отдельности — jscpd-храповик поймал дубль (CLAUDE.md «Дубли и мёртвый код»).
//
// `refresh()` — тихое перечитывание для фонового опроса (usePollWhileVisible,
// ADR-0074): человек его не заказывал, поэтому скелетон и баннер ошибки не
// должны мигнуть, а сбой должен молча пройти мимо — список на экране остаётся
// прежним. `reload()` и `refresh()` — один и тот же запрос с разным
// поведением на границах, поэтому обе стоят на одной функции `run({ quiet })`
// (без копипасты, jscpd-храповик).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';

export interface UseAbortableFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Фоновое перечитывание без скелетона и баннера ошибки — для опроса,
   * которого человек не заказывал (usePollWhileVisible.ts). */
  refresh: () => Promise<void>;
}

export interface UseAbortableFetchOptions {
  /** По умолчанию `true`. `false` — хук не запрашивает данные сам при
   * монтировании (например, `usePeople({ enabled: isAdmin })`, ADR-0030:
   * учитель видит `/people`, но список учеников — только admin, и звать
   * `GET /users` от его имени незачем — сервер всё равно ответит 403). */
  enabled?: boolean;
}

/**
 * `load` вызывается заново на каждый `reload()`/`refresh()` с актуальным
 * `AbortSignal`; держим последнюю версию в ref, а не в зависимостях
 * `useCallback` — иначе хук вроде `useLessons` (окно `from/to` пересчитывается
 * на каждый вызов) гонял бы лишний `reload` при каждом рендере.
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
  // Идёт ли уже запрос (свой или чужой) — тихий тик смотрит сюда и просто
  // выходит, а не обрывает то, что уже в полёте: обрыв чужого запроса увёл бы
  // его в отдельную, проигранную ветку сверки requestId, и его finally
  // никогда не снял бы loading (см. run() ниже).
  const inFlight = useRef(false);

  const run = useCallback(
    async ({ quiet }: { quiet: boolean }) => {
      if (quiet && inFlight.current) return;

      abortController.current?.abort();
      const controller = new AbortController();
      abortController.current = controller;
      const thisRequest = (requestId.current += 1);
      inFlight.current = true;

      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await loadRef.current(controller.signal);
        if (requestId.current !== thisRequest) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (requestId.current !== thisRequest) return;
        // Тихий сбой не пишет ничего: список на экране остаётся прежним —
        // баннер поверх ещё живых данных был бы неправдой (сеть моргнула
        // сама по себе, а не запрошенное человеком действие провалилось).
        if (!quiet) {
          setError(err instanceof ApiError ? err.message : fallbackErrorMessage);
        }
      } finally {
        if (requestId.current === thisRequest) {
          inFlight.current = false;
          if (!quiet) setLoading(false);
        }
      }
    },
    [fallbackErrorMessage],
  );

  const reload = useCallback(() => run({ quiet: false }), [run]);
  const refresh = useCallback(() => run({ quiet: true }), [run]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return () => abortController.current?.abort();
  }, [reload, enabled]);

  return { data, loading, error, reload, refresh };
}
