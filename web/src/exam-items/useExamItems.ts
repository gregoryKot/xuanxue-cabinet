// Данные экрана «Вопросы для экзамена» — список с фильтрами и мутации
// (CLAUDE.md «Read-after-write»), по образцу schedule/useClasses.ts.
// Фильтры меняются с экрана, а не переоткрытием — перечитываем список при их
// смене, тот же приём, что у broadcasts/useBroadcasts.ts.
import { useCallback, useEffect, useRef } from 'react';
import {
  LIST_LIMIT_MAX,
  type CreateExamItemInput,
  type ExamItemDto,
  type ExamItemKind,
  type ExamItemStatus,
  type UpdateExamItemInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить вопросы. Попробуйте ещё раз.';

export interface ExamItemFilters {
  status: ExamItemStatus | '';
  kind: ExamItemKind | '';
  tag: string;
}

export interface UseExamItemsResult {
  items: ExamItemDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateExamItemInput) => Promise<void>;
  update: (id: string, input: UpdateExamItemInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function buildListPath(filters: ExamItemFilters): string {
  const params = [`limit=${LIST_LIMIT_MAX}`];
  if (filters.status) params.push(`status=${filters.status}`);
  if (filters.kind) params.push(`kind=${filters.kind}`);
  if (filters.tag) params.push(`tag=${encodeURIComponent(filters.tag)}`);
  return `/exam-items?${params.join('&')}`;
}

export function useExamItems(filters: ExamItemFilters): UseExamItemsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamItemDto[]>(buildListPath(filters), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // useAbortableFetch сам перечитывает только по явному reload() — первый
  // рендер уже сделал запрос сам, этот эффект реагирует только на смену
  // фильтров после монтирования (pr-k3-fixes.md п.17 у useBroadcasts.ts).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [filters.status, filters.kind, filters.tag, reload]);

  const create = useCallback(
    async (input: CreateExamItemInput) => {
      await apiFetch('/exam-items', { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: UpdateExamItemInput) => {
      await apiFetch(`/exam-items/${id}`, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/exam-items/${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { items: data, loading, error, reload, create, update, remove };
}
