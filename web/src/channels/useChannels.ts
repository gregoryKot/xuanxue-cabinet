// Список каналов — «Каналы», «Расписание» и «Рассылки» читают один и тот же
// запрос (CLAUDE.md «Одна механика — один компонент»). Создание, правка и
// удаление живут на странице канала и ходят через hooks/useEntityEditor.ts
// (ADR-0033) — списку осталось только чтение. Гонка запросов и разбор ошибки —
// в общем hooks/useAbortableFetch.ts.
import type { ChannelDto } from '@xuanxue/shared';
import { CHANNELS_LIST_QUERY } from '../api/listQueries';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить каналы. Попробуйте ещё раз.';

export interface UseChannelsResult {
  channels: ChannelDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Все каналы школы: выключателя у канала нет (ADR-0194), один список на
 * «Каналы», «Расписание» и «Рассылки». */
export function useChannels(): UseChannelsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiRoute('GET /channels', { query: CHANNELS_LIST_QUERY, signal }),
    LOAD_ERROR_MESSAGE,
  );

  return { channels: data, loading, error, reload };
}
