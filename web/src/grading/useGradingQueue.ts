// Очередь проверки — сданные работы (слой 4.6, ТЗ 4.6, п.1), по образцу
// exams/useExams.ts. Владение и роль проверяет сервер
// (ExamAttemptsController, @Roles('teacher', 'assistant', 'admin')) — здесь
// только чтение готового списка.
import { LIST_LIMIT_MAX, type ExamAttemptDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить очередь проверки. Попробуйте ещё раз.';
const SUBMITTED_PATH = `/attempts?status=submitted&limit=${LIST_LIMIT_MAX}`;

export interface UseGradingQueueResult {
  attempts: ExamAttemptDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useGradingQueue(): UseGradingQueueResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamAttemptDto[]>(SUBMITTED_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { attempts: data, loading, error, reload };
}
