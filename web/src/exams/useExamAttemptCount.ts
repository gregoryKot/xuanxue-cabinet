// Число прошлых попыток экзамена — учителю в редакторе, под «Вопросы · N»
// (ExamAttemptsNote.tsx, attemptsNote.ts, ADR-0022): попытка хранит снимок
// формы на старте, правка вопросов до уже начатых и сданных работ не
// доедет. По образцу grading/useGradingQueue.ts; `enabled` — тот же приём,
// что у hooks/useEntityEditor.ts: у нового экзамена (`/exams/new`) id ещё
// нет, запрос не нужен.
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить число попыток.';

export interface UseExamAttemptCountResult {
  /** `null` — ещё грузится, сбой запроса или экзамена нет (новый). Заметка
   * на экране тогда просто не рисуется (ExamAttemptsNote.tsx) — сбой счётчика
   * не должен ломать редактор. */
  total: number | null;
  loading: boolean;
  error: string | null;
}

export function useExamAttemptCount(
  examId: string | undefined,
): UseExamAttemptCountResult {
  // Без id колбэк не вызывается вовсе (enabled: false) — каст только для
  // типов, запрос с пустым id уйти не может (как в useEntityEditor.ts).
  const { data, loading, error } = useAbortableFetch(
    (signal) =>
      apiRoute('GET /exams/:examId/attempt-count', {
        params: { examId: examId as string },
        signal,
      }),
    LOAD_ERROR_MESSAGE,
    { enabled: examId !== undefined },
  );
  return { total: data?.total ?? null, loading, error };
}
