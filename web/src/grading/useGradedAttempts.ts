// Проверенные работы — второй список «Проверки работ» (docs/PLAN.md §4.6,
// отзыв владельца школы: разделить работы на два списка, проверенные и
// непроверенные). По образцу useGradingQueue.ts, отдельным файлом — свой
// путь и своя загрузка, не второй запрос внутри хука очереди: разделы
// экрана грузятся и перезагружаются независимо друг от друга.
import type { ExamAttemptDto } from '@xuanxue/shared';
import { GRADED_ATTEMPTS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить проверенные работы. Попробуйте ещё раз.';

export interface UseGradedAttemptsResult {
  attempts: ExamAttemptDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useGradedAttempts(): UseGradedAttemptsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamAttemptDto[]>(GRADED_ATTEMPTS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { attempts: data, loading, error, reload };
}
