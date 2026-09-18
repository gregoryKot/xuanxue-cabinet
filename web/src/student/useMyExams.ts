// Данные раздела «Экзамены» на экране ученика — GET /me/exams (read-only, по
// образцу useMyLessons.ts) плюс старт попытки (POST /exams/:id/attempts).
// Старт не перечитывает список сам: экран сразу уводит на /attempts/:id
// (TasksScreen.tsx), а к списку человек вернётся уже с обновлённым
// /me/exams при следующем заходе на экран.
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить экзамены. Попробуйте ещё раз.';

export interface UseMyExamsResult extends UseAbortableFetchResult<MyExamDto[]> {
  startAttempt: (examId: string) => Promise<ExamAttemptDto>;
}

export function useMyExams(): UseMyExamsResult {
  const result = useAbortableFetch(
    (signal) => apiFetch<MyExamDto[]>(MY_EXAMS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  function startAttempt(examId: string): Promise<ExamAttemptDto> {
    // Идемпотентный старт (ТЗ, «API готов»): двойной клик и это же самое
    // «Продолжить» после возврата на экран отдают одну и ту же попытку.
    return apiFetch<ExamAttemptDto>(`/exams/${examId}/attempts`, { method: 'POST' });
  }

  return { ...result, startAttempt };
}
