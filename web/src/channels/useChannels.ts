// Список каналов — «Каналы», «Расписание» и «Рассылки» читают один и тот же
// запрос (CLAUDE.md «Одна механика — один компонент»). Создание, правка и
// удаление живут на странице канала и ходят через hooks/useEntityEditor.ts
// (ADR-0033) — списку осталось только чтение. Гонка запросов и разбор ошибки —
// в общем hooks/useAbortableFetch.ts.
import { LIST_LIMIT_MAX, type ChannelDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить каналы. Попробуйте ещё раз.';

export interface UseChannelsResult {
  channels: ChannelDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** `activeOnly` — экран «Каналы» показывает все каналы (по умолчанию);
 * «Расписание» выбирает только активные для рассылки занятия (ревью п.1,
 * docs/PLAN.md §6 п.1) — тот же хук, без второй реализации списка. */
export function useChannels(activeOnly = false): UseChannelsResult {
  const query = activeOnly
    ? `?active=true&limit=${LIST_LIMIT_MAX}`
    : `?limit=${LIST_LIMIT_MAX}`;
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ChannelDto[]>(`/channels${query}`, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { channels: data, loading, error, reload };
}
