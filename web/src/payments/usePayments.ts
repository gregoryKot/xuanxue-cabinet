// Данные экрана «Оплаты»: список месяца, переключение месяца, подтверждение и
// снятие. `confirm`/`revoke` кладут в список строку из ответа записи, второй
// `GET` не шлют (ADR-0087, check-write-then-reload.mjs): сервер вернул
// свежий `PaymentDto`, а порядок строк (по имени) запись не двигает —
// подробности в withPaymentRow.ts. Гонка запросов и разбор ошибки загрузки —
// в общем hooks/useAbortableFetch.ts.
import { useCallback, useRef, useState } from 'react';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { paymentsQuery } from '../api/paymentsApiPaths';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { withPaymentRow } from './withPaymentRow';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить оплаты. Попробуйте ещё раз.';

export interface UsePaymentsResult {
  page: PaymentsPageDto | null;
  /** Месяц на экране: выбранный человеком, а пока не выбирал — тот, что
   * назвал сервер. `null` — первая загрузка ещё не ответила. */
  month: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  selectMonth: (month: string) => Promise<void>;
  confirm: (userId: string, month: string) => Promise<void>;
  revoke: (userId: string, month: string) => Promise<void>;
}

export function usePayments(): UsePaymentsResult {
  // Выбранный месяц читает и `load` (в момент запроса), и экран (в момент
  // отрисовки): ref — чтобы перечитывание после `selectMonth` не ждало
  // следующего рендера, state — чтобы экран перерисовался. `null` — «текущий,
  // решает сервер»: часы школы клиент не считает.
  const requestedRef = useRef<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) =>
      apiRoute('GET /payments', { query: paymentsQuery(requestedRef.current), signal }),
    LOAD_ERROR_MESSAGE,
  );

  const selectMonth = useCallback(
    (month: string) => {
      requestedRef.current = month;
      setRequested(month);
      return reload();
    },
    [reload],
  );

  const apply = useCallback(
    (next: PaymentDto) => applyData((prev) => withPaymentRow(prev, next)),
    [applyData],
  );
  // Тело подтверждения пустое: сумма необязательна (ADR-0049), а экран
  // подтверждает одной кнопкой.
  const confirm = useCallback(
    async (userId: string, month: string) =>
      apply(
        await apiRoute('POST /payments/:userId/:month/confirm', {
          params: { userId, month },
          body: {},
        }),
      ),
    [apply],
  );
  const revoke = useCallback(
    async (userId: string, month: string) =>
      apply(
        await apiRoute('POST /payments/:userId/:month/revoke', {
          params: { userId, month },
        }),
      ),
    [apply],
  );

  const month = requested ?? data?.month ?? null;
  return { page: data, month, loading, error, reload, selectMonth, confirm, revoke };
}
