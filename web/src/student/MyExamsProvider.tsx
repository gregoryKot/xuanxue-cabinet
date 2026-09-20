// Общий источник списка экзаменов ученика на всё приложение (ADR-0063) —
// GET /me/exams грузится один раз: экран «Задания» (TasksScreen.tsx) и центр
// уведомлений (useNotificationsData.ts, счётчик новых заданий у колокольчика)
// обязаны жить с одного запроса, а не заводить каждый свой второй копией
// состояния. Приём — как у auth/AuthProvider.tsx и
// notifications/NotificationsProvider.tsx (единственный источник данных на
// приложение через контекст).
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
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

const MyExamsContext = createContext<UseMyExamsResult | null>(null);

/** Запрос + старт попытки — приватно для файла, наружу смотрят только
 * MyExamsProvider и useMyExams() ниже (как useNotificationsData.ts приватен
 * для NotificationsProvider.tsx). */
function useMyExamsData(): UseMyExamsResult {
  const result = useAbortableFetch(
    (signal) => apiFetch<MyExamDto[]>(MY_EXAMS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // useCallback — иначе новая ссылка на каждый рендер обесценивала бы useMemo
  // значения контекста ниже (та же оговорка, что в NotificationsProvider.tsx).
  const startAttempt = useCallback((examId: string): Promise<ExamAttemptDto> => {
    // Идемпотентный старт (ТЗ, «API готов»): двойной клик и это же самое
    // «Продолжить» после возврата на экран отдают одну и ту же попытку.
    return apiFetch<ExamAttemptDto>(`/exams/${examId}/attempts`, { method: 'POST' });
  }, []);

  return { ...result, startAttempt };
}

export function MyExamsProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload, startAttempt } = useMyExamsData();

  // Разложено по полям, а не `[data]`/по объекту целиком: сам объект хук
  // пересобирает каждым рендером, и мемо по ссылке на него не экономило бы
  // ничего (тот же приём, что в NotificationsProvider.tsx).
  const value = useMemo(
    () => ({ data, loading, error, reload, startAttempt }),
    [data, loading, error, reload, startAttempt],
  );

  return <MyExamsContext.Provider value={value}>{children}</MyExamsContext.Provider>;
}

export function useMyExams(): UseMyExamsResult {
  const ctx = useContext(MyExamsContext);
  if (!ctx) throw new Error('useMyExams() вызван вне <MyExamsProvider>');
  return ctx;
}
