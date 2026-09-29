// Данные блока «Абонемент» в профиле ученика — GET /me/payments (PLAN §15,
// слой 2.4) и загрузка скриншота перевода запасным путём кабинета (ADR-0050).
// Ответ POST — уже готовая строка месяца: applyData кладёт её в страницу без
// перечитывания списка (ADR-0087, check-write-then-reload).
import { useCallback, useState } from 'react';
import type { MyPaymentDto, MyPaymentsPageDto } from '@xuanxue/shared';
import { MY_PAYMENTS_PATH, myPaymentScreenshotPath } from '../api/paymentPaths';
import { UPLOAD_TIMEOUT_MS, apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { prepareExamImage } from '../lib/examImageFile';
import { applyUploadedPayment } from './applyUploadedPayment';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить абонемент. Попробуйте ещё раз.';
// ApiError и Error из prepareExamImage (файл слишком большой, формат не
// читается) несут готовый текст по VOICE — этот запасной только на
// непредвиденное исключение.
const UPLOAD_ERROR_MESSAGE = 'Не удалось отправить скриншот. Попробуйте ещё раз.';

export interface UseMyPaymentsResult {
  page: MyPaymentsPageDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  uploadScreenshot: (month: string, file: File) => Promise<void>;
  uploading: boolean;
  uploadError: string | null;
}

export function useMyPayments(): UseMyPaymentsResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiFetch<MyPaymentsPageDto>(MY_PAYMENTS_PATH, { signal }),
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
        const dto = await apiFetch<MyPaymentDto>(myPaymentScreenshotPath(month), {
          method: 'POST',
          body: blob,
          timeoutMs: UPLOAD_TIMEOUT_MS,
        });
        // Страница уже загружена (кнопка есть только у неё); если её ещё нет,
        // ответ класть некуда — оставляем как есть.
        applyData((prev) => (prev ? applyUploadedPayment(prev, dto) : prev));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE);
      } finally {
        setUploading(false);
      }
    },
    [applyData],
  );

  return { page: data, loading, error, reload, uploadScreenshot, uploading, uploadError };
}
