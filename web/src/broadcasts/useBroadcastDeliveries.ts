// Доставки одной рассылки — грузятся только когда карточка раскрыта
// (BroadcastCard монтирует этот хук по клику, не заранее). Гонка запросов и
// разбор ошибки — в общем hooks/useAbortableFetch.ts.
import type { DeliveryDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить доставки. Попробуйте ещё раз.';

export interface UseBroadcastDeliveriesResult {
  deliveries: DeliveryDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useBroadcastDeliveries(
  broadcastId: string,
): UseBroadcastDeliveriesResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) =>
      apiRoute('GET /broadcasts/:id/deliveries', { params: { id: broadcastId }, signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { deliveries: data, loading, error, reload };
}
