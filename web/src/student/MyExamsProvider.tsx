// Общий источник списка экзаменов ученика на всё приложение (ADR-0063) —
// GET /me/exams грузится один раз: экран «Задания» (TasksScreen.tsx) и центр
// уведомлений (useNotificationsData.ts, счётчик новых заданий у колокольчика)
// обязаны жить с одного запроса, а не заводить каждый свой второй копией
// состояния. Приём — как у auth/AuthProvider.tsx и
// notifications/NotificationsProvider.tsx (единственный источник данных на
// приложение через контекст).
//
// `me` — тем же приёмом, что у NotificationsProvider.tsx (проп, не второй
// useAuth() внутри): им решается, нужен ли сам запрос (ADR-0074). Экзамены —
// механика ученика, у штата школы запрос выключен везде, кроме «/tasks» —
// туда штат тоже попадает по прямой ссылке (canSeeRoute, screenAccess.ts) и
// там список нужен для самого экрана, не для счётчика. Роль, при которой
// счётчик всё равно не должен считать эти формы «новым заданием» (штат на
// «/tasks»), фильтруется в useNotificationsData.ts — этот провайдер решает
// только «идёт ли запрос», не «что из ответа значит „новое“».
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { ExamAttemptDto, MeDto, MyExamDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { isTeacher } from '../app/screenAccess';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить экзамены. Попробуйте ещё раз.';
// Единственный экран штата, которому список экзаменов нужен напрямую — сам
// маршрут открыт любой роли (STUDENT_TASKS_PATH в screenAccess.ts, константа
// не экспортирована оттуда, поэтому здесь своя копия строки, как в
// notificationTarget.ts/NewTaskCard.tsx).
const TASKS_PATH = '/tasks';

export interface UseMyExamsResult extends UseAbortableFetchResult<MyExamDto[]> {
  startAttempt: (examId: string) => Promise<ExamAttemptDto>;
}

const MyExamsContext = createContext<UseMyExamsResult | null>(null);

/** Запрос + старт попытки — приватно для файла, наружу смотрят только
 * MyExamsProvider и useMyExams() ниже (как useNotificationsData.ts приватен
 * для NotificationsProvider.tsx). */
function useMyExamsData(me: MeDto | null): UseMyExamsResult {
  const { pathname } = useLocation();
  const enabled = !isTeacher(me) || pathname === TASKS_PATH;
  const result = useAbortableFetch(
    (signal) => apiFetch<MyExamDto[]>(MY_EXAMS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled },
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

export function MyExamsProvider({
  me,
  children,
}: {
  me: MeDto | null;
  children: ReactNode;
}) {
  const { data, loading, error, reload, refresh, startAttempt } = useMyExamsData(me);

  // Разложено по полям, а не `[data]`/по объекту целиком: сам объект хук
  // пересобирает каждым рендером, и мемо по ссылке на него не экономило бы
  // ничего (тот же приём, что в NotificationsProvider.tsx).
  const value = useMemo(
    () => ({ data, loading, error, reload, refresh, startAttempt }),
    [data, loading, error, reload, refresh, startAttempt],
  );

  return <MyExamsContext.Provider value={value}>{children}</MyExamsContext.Provider>;
}

export function useMyExams(): UseMyExamsResult {
  const ctx = useContext(MyExamsContext);
  if (!ctx) throw new Error('useMyExams() вызван вне <MyExamsProvider>');
  return ctx;
}
