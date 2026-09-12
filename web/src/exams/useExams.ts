// Данные экрана «Экзамены» — список с фильтрами и мутации (CLAUDE.md
// «Read-after-write»), по образцу exam-items/useExamItems.ts.
import { useCallback, useEffect, useRef } from 'react';
import {
  LIST_LIMIT_MAX,
  type CreateExamInput,
  type ExamDto,
  type ExamStatus,
  type UpdateExamInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить экзамены. Попробуйте ещё раз.';

export interface ExamFilters {
  status: ExamStatus | '';
  level: string;
}

export interface UseExamsResult {
  exams: ExamDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateExamInput) => Promise<void>;
  update: (id: string, input: UpdateExamInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function buildListPath(filters: ExamFilters): string {
  const params = [`limit=${LIST_LIMIT_MAX}`];
  if (filters.status) params.push(`status=${filters.status}`);
  if (filters.level) params.push(`level=${encodeURIComponent(filters.level)}`);
  return `/exams?${params.join('&')}`;
}

export function useExams(filters: ExamFilters): UseExamsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamDto[]>(buildListPath(filters), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // Как useExamItems.ts: первый рендер уже сделал запрос сам, этот эффект
  // перечитывает список только на смену фильтров после монтирования.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [filters.status, filters.level, reload]);

  const create = useCallback(
    async (input: CreateExamInput) => {
      await apiFetch('/exams', { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: UpdateExamInput) => {
      await apiFetch(`/exams/${id}`, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/exams/${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { exams: data, loading, error, reload, create, update, remove };
}
