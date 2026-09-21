// Число прошлых попыток экзамена — учителю в редакторе, под «Вопросы · N»
// (ExamAttemptsNote.tsx, attemptsNote.ts, ADR-0022): попытка хранит снимок
// формы на старте, правка вопросов до уже начатых и сданных работ не
// доедет. По образцу grading/useGradingQueue.ts; `enabled` — тот же приём,
// что у hooks/useEntityEditor.ts: у нового экзамена (`/exams/new`) id ещё
// нет, запрос не нужен.
import type { ExamAttemptCountDto } from '@xuanxue/shared';
import { examAttemptCountPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
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
  // Путь считаем и для undefined — при enabled: false колбэк ни разу не
  // вызовется, но типам нужна строка, а не undefined (как в useEntityEditor.ts).
  const path = examId === undefined ? '' : examAttemptCountPath(examId);
  const { data, loading, error } = useAbortableFetch(
    (signal) => apiFetch<ExamAttemptCountDto>(path, { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled: examId !== undefined },
  );
  return { total: data?.total ?? null, loading, error };
}
