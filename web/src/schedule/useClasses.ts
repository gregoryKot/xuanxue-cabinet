// Данные экрана «Расписание» — список занятий и мутации (CLAUDE.md
// «Read-after-write»): после create/update/remove список перечитывается
// заново — на одном экране без денормализации optimistic-обновление лишнее.
// create/update/remove не глотают ошибку — её показывает форма (ClassSheet).
// reload() отменяет предыдущий запрос при повторном вызове (двойной клик
// «Обновить», размонтирование экрана посреди загрузки) — AbortController +
// сверка id запроса против setState из уже устаревшего ответа (ревью п.13).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LIST_LIMIT_MAX,
  type ClassDto,
  type CreateClassInput,
  type UpdateClassInput,
} from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить расписание. Попробуйте ещё раз.';

export interface UseClassesResult {
  classes: ClassDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateClassInput) => Promise<void>;
  update: (id: string, input: UpdateClassInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useClasses(): UseClassesResult {
  const [classes, setClasses] = useState<ClassDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const thisRequest = (requestId.current += 1);

    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<ClassDto[]>(`/classes?limit=${LIST_LIMIT_MAX}`, {
        signal: controller.signal,
      });
      if (requestId.current !== thisRequest) return; // пришёл более новый reload()
      setClasses(list);
    } catch (err) {
      if (requestId.current !== thisRequest) return;
      setError(err instanceof ApiError ? err.message : LOAD_ERROR_MESSAGE);
    } finally {
      if (requestId.current === thisRequest) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => abortController.current?.abort();
  }, [reload]);

  const create = useCallback(
    async (input: CreateClassInput) => {
      await apiFetch('/classes', { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: UpdateClassInput) => {
      await apiFetch(`/classes/${id}`, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/classes/${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { classes, loading, error, reload, create, update, remove };
}
