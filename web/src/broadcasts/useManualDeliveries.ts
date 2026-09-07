// Блок «Ждут отправки вручную» вверху журнала (docs/PLAN.md §6 «Рассылки»):
// GET /deliveries?status=manual&limit=50 — без окна дат, это не история, а
// текущие проблемы (см. ListDeliveriesQuery в shared). Гонка запросов и
// разбор ошибки — в общем hooks/useAbortableFetch.ts.
import { LIST_LIMIT_DEFAULT, type DeliveryDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить доставки, которые ждут вручную. Попробуйте ещё раз.';

export interface UseManualDeliveriesResult {
  deliveries: DeliveryDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useManualDeliveries(): UseManualDeliveriesResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) =>
      apiFetch<DeliveryDto[]>(`/deliveries?status=manual&limit=${LIST_LIMIT_DEFAULT}`, {
        signal,
      }),
    LOAD_ERROR_MESSAGE,
  );
  return { deliveries: data, loading, error, reload };
}
