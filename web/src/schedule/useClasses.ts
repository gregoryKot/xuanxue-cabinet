// Данные экрана «Расписание» — список занятий и мутации (CLAUDE.md
// «Read-after-write»): после create/update/remove список перечитывается
// заново — на одном экране без денормализации optimistic-обновление лишнее.
// create/update/remove не глотают ошибку — её показывает форма (ClassSheet).
// Гонка запросов и разбор ошибки — в общем useAbortableFetch (используется
// также useLessons/useSummary — иначе jscpd ловит дубль AbortController +
// сверки id запроса).
import { useCallback } from 'react';
import {
  LIST_LIMIT_MAX,
  type ClassDto,
  type CreateClassInput,
  type UpdateClassInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

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
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ClassDto[]>(`/classes?limit=${LIST_LIMIT_MAX}`, { signal }),
    LOAD_ERROR_MESSAGE,
  );

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

  return { classes: data, loading, error, reload, create, update, remove };
}
