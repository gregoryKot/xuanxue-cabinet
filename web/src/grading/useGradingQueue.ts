// Очередь проверки — сданные работы (слой 4.6, ТЗ 4.6, п.1), по образцу
// exams/useExams.ts. Владение и роль проверяет сервер
// (ExamAttemptQueueController, @Roles('teacher', 'assistant', 'admin')) —
// здесь только чтение готового списка строк без снимка формы (F33).
//
// `removeAttemptsOfExams` — после массового удаления экзаменов (ADR-0141)
// экран «Экзамены» выкидывает их работы из уже загруженной очереди: сервер
// делает то же самое (ADR-0140, попытки удалённой формы не приходят в
// списке), а без этого число «ждут проверки» на том же экране оставалось бы
// старым до следующего захода. Второй GET не нужен (ADR-0087).
import { useCallback } from 'react';
import type { ExamAttemptQueueItemDto } from '@xuanxue/shared';
import { GRADING_QUEUE_QUERY } from '../api/gradingPaths';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить очередь проверки. Попробуйте ещё раз.';

export interface UseGradingQueueResult {
  attempts: ExamAttemptQueueItemDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  removeAttemptsOfExams: (examIds: readonly string[]) => void;
}

export function useGradingQueue(): UseGradingQueueResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /attempts/queue', { query: GRADING_QUEUE_QUERY, signal }),
    LOAD_ERROR_MESSAGE,
  );
  const removeAttemptsOfExams = useCallback(
    (examIds: readonly string[]) =>
      applyData(
        (prev) => prev?.filter((attempt) => !examIds.includes(attempt.examId)) ?? null,
      ),
    [applyData],
  );
  return { attempts: data, loading, error, reload, removeAttemptsOfExams };
}
