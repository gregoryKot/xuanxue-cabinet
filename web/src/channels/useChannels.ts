// Данные экрана «Каналы» — список и мутации (CLAUDE.md «Read-after-write»):
// после create/update/remove список перечитывается заново. Гонка запросов и
// разбор ошибки — в общем hooks/useAbortableFetch.ts.
import { useCallback } from 'react';
import {
  LIST_LIMIT_MAX,
  type ChannelDto,
  type CreateChannelInput,
  type UpdateChannelInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить каналы. Попробуйте ещё раз.';

export interface UseChannelsResult {
  channels: ChannelDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateChannelInput) => Promise<void>;
  update: (id: string, input: UpdateChannelInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** `activeOnly` — экран «Каналы» показывает и правит все каналы (по
 * умолчанию); «Расписание» выбирает только активные для рассылки занятия
 * (ревью п.1, docs/PLAN.md §6 п.1) — тот же хук, без второй реализации
 * списка (CLAUDE.md «Одна механика — один компонент»). */
export function useChannels(activeOnly = false): UseChannelsResult {
  const query = activeOnly
    ? `?active=true&limit=${LIST_LIMIT_MAX}`
    : `?limit=${LIST_LIMIT_MAX}`;
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ChannelDto[]>(`/channels${query}`, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const create = useCallback(
    async (input: CreateChannelInput) => {
      await apiFetch('/channels', { method: 'POST', body: input });
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: UpdateChannelInput) => {
      await apiFetch(`/channels/${id}`, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/channels/${id}`, { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { channels: data, loading, error, reload, create, update, remove };
}
