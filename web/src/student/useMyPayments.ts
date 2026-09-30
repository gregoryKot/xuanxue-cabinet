// Данные блока «Абонемент» в профиле ученика — GET /me/payments (PLAN §15,
// слой 2.4) и загрузка скриншота перевода запасным путём кабинета (ADR-0050).
// Ответ POST — уже готовая строка месяца: applyData кладёт её в страницу без
// перечитывания списка (ADR-0087, check-write-then-reload).
import { useCallback, useState } from 'react';
import type { MyPaymentReminderDto, MyPaymentsPageDto } from '@xuanxue/shared';
import { UPLOAD_TIMEOUT_MS } from '../api/http';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { prepareExamImage } from '../lib/examImageFile';
import { applyUploadedPayment } from './applyUploadedPayment';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить данные об оплате. Попробуйте ещё раз.';
// ApiError и Error из prepareExamImage (файл слишком большой, формат не
// читается) несут готовый текст по VOICE — этот запасной только на
// ошибку без текста: пустая строка под кнопкой читалась бы как «ничего не случилось».
const UPLOAD_ERROR_MESSAGE = 'Не удалось отправить скриншот. Попробуйте ещё раз.';

export interface UseMyPaymentsResult {
  page: MyPaymentsPageDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  uploadScreenshot: (month: string, file: File) => Promise<void>;
  uploading: boolean;
  uploadError: string | null;
  /** Вписывает ответ `PUT /me/payments/reminder-day` в страницу (ADR-0160). */
  applyReminder: (reminder: MyPaymentReminderDto) => void;
}

export function useMyPayments(): UseMyPaymentsResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /me/payments', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadScreenshot = useCallback(
    async (month: string, file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        const blob = await prepareExamImage(file);
        const dto = await apiRoute('POST /me/payments/:month/screenshot', {
          params: { month },
          body: blob,
          timeoutMs: UPLOAD_TIMEOUT_MS,
        });
        applyData((prev) => applyUploadedPayment(prev, dto));
      } catch (err) {
        setUploadError(
          err instanceof Error && err.message ? err.message : UPLOAD_ERROR_MESSAGE,
        );
      } finally {
        setUploading(false);
      }
    },
    [applyData],
  );

  const applyReminder = useCallback(
    (reminder: MyPaymentReminderDto) =>
      applyData((prev) => (prev ? { ...prev, reminder } : prev)),
    [applyData],
  );

  return {
    page: data,
    loading,
    error,
    reload,
    uploadScreenshot,
    uploading,
    uploadError,
    applyReminder,
  };
}
