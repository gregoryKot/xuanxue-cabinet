// Журнал «Рассылки» — окно периода и фильтр статуса меняются с экрана,
// перечитываем список при их смене (CLAUDE.md «Read-after-write» — то же для
// create/cancel). Гонка запросов — в общем hooks/useAbortableFetch.ts.
import { useCallback, useEffect, useRef } from 'react';
import {
  LIST_LIMIT_MAX,
  type BroadcastDto,
  type BroadcastStatus,
  type CreateBroadcastInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { journalWindow, type JournalRangeWeeks } from './broadcastWindow';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить журнал рассылок. Попробуйте ещё раз.';

export interface UseBroadcastsResult {
  broadcasts: BroadcastDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateBroadcastInput) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}

export function useBroadcasts(
  rangeWeeks: JournalRangeWeeks,
  status: BroadcastStatus | '',
): UseBroadcastsResult {
  const { data, loading, error, reload } = useAbortableFetch((signal) => {
    const { from, to } = journalWindow(rangeWeeks);
    const statusParam = status ? `&status=${status}` : '';
    return apiFetch<BroadcastDto[]>(
      `/broadcasts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${statusParam}&limit=${LIST_LIMIT_MAX}`,
      { signal },
    );
  }, LOAD_ERROR_MESSAGE);

  // Период и статус меняются с экрана — перечитываем список при их смене
  // (useAbortableFetch сам перечитывает только по явному reload()). Первый
  // рендер уже сделал один запрос сам useAbortableFetch — этот эффект на
  // монтировании его не дублирует (pr-k3-fixes.md п.17: было два запроса на
  // старте — один от useAbortableFetch, один отсюда), реагирует только на
  // смену периода/статуса после монтирования.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [rangeWeeks, status, reload]);

  const create = useCallback(
    async (input: CreateBroadcastInput) => {
      await apiFetch('/broadcasts', { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const cancel = useCallback(
    async (id: string) => {
      await apiFetch(`/broadcasts/${id}/cancel`, { method: 'POST' });
      await reload();
    },
    [reload],
  );

  return { broadcasts: data, loading, error, reload, create, cancel };
}
