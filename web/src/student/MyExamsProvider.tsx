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
import { applyExamAttempt } from './applyExamAttempt';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить экзамены. Попробуйте ещё раз.';
// Единственный экран штата, которому список экзаменов нужен напрямую — сам
// маршрут открыт любой роли (STUDENT_TASKS_PATH в screenAccess.ts, константа
// не экспортирована оттуда, поэтому здесь своя копия строки, как в
// notificationTarget.ts/NewTaskCard.tsx).
const TASKS_PATH = '/tasks';

export interface UseMyExamsResult extends UseAbortableFetchResult<MyExamDto[]> {
  startAttempt: (examId: string) => Promise<ExamAttemptDto>;
  /** Патч списка ответом записи (ADR-0119, applyExamAttempt.ts) — без
   * второго `GET /me/exams` после старта или отправки попытки: правит
   * `lastAttempt` нужного экзамена и, если это новая попытка, `attemptsUsed`. */
  applyAttempt: (attempt: ExamAttemptDto) => void;
}

const MyExamsContext = createContext<UseMyExamsResult | null>(null);

/** No-op для useMyExamsApplyAttempt() ниже, когда провайдера нет —
 * см. комментарий у неё: в проде экран сдачи всегда внутри MyExamsProvider
 * (AppShell.tsx), это только для изолированных тестов самого экрана. */
function noopApplyAttempt(): void {}

/** Запрос + старт попытки — приватно для файла, наружу смотрят только
 * MyExamsProvider и useMyExams() ниже (как useNotificationsData.ts приватен
 * для NotificationsProvider.tsx). */
function useMyExamsData(me: MeDto | null): UseMyExamsResult {
  const { pathname } = useLocation();
  const enabled = !isTeacher(me) || pathname === TASKS_PATH;
  const { applyData, ...result } = useAbortableFetch(
    (signal) => apiFetch<MyExamDto[]>(MY_EXAMS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled },
  );

  // useCallback — иначе новая ссылка на каждый рендер обесценивала бы useMemo
  // значения контекста ниже (та же оговорка, что в NotificationsProvider.tsx).
  const startAttempt = useCallback((examId: string): Promise<ExamAttemptDto> => {
    // Старт новой попытки — API идемпотентен, только пока последняя попытка
    // ещё in_progress: тот же POST второй раз отдаёт её же
    // (ExamAttemptsService.start, exam-attempts.service.ts). Как только она
    // submitted/graded, повторный POST заводит НОВУЮ, пустую попытку — тем и
    // был баг (отзыв тестировщика 2026-09-22: «кнопка продолжить, а ответы
    // обнуляются»): экран звал startAttempt() на устаревшем списке, где
    // lastAttempt ещё выглядел in_progress. «Продолжить»
    // (getMyExamAction === 'continue') сюда больше не ходит — экран
    // открывает уже известную попытку по id напрямую (TasksScreen.tsx,
    // resolveTaskStartTarget.ts, ADR-0119); этот POST остаётся только у
    // «Начать» и «Пройти ещё раз», где новая попытка — правда то, что нужно.
    return apiFetch<ExamAttemptDto>(`/exams/${examId}/attempts`, { method: 'POST' });
  }, []);

  const applyAttempt = useCallback(
    (attempt: ExamAttemptDto) => {
      applyData((prev) => applyExamAttempt(prev, attempt));
    },
    [applyData],
  );

  return { ...result, startAttempt, applyAttempt };
}

export function MyExamsProvider({
  me,
  children,
}: {
  me: MeDto | null;
  children: ReactNode;
}) {
  const { data, loading, error, reload, refresh, startAttempt, applyAttempt } =
    useMyExamsData(me);

  // Разложено по полям, а не `[data]`/по объекту целиком: сам объект хук
  // пересобирает каждым рендером, и мемо по ссылке на него не экономило бы
  // ничего (тот же приём, что в NotificationsProvider.tsx).
  const value = useMemo(
    () => ({ data, loading, error, reload, refresh, startAttempt, applyAttempt }),
    [data, loading, error, reload, refresh, startAttempt, applyAttempt],
  );

  return <MyExamsContext.Provider value={value}>{children}</MyExamsContext.Provider>;
}

export function useMyExams(): UseMyExamsResult {
  const ctx = useContext(MyExamsContext);
  if (!ctx) throw new Error('useMyExams() вызван вне <MyExamsProvider>');
  return ctx;
}

/** Только `applyAttempt`, без исключения вне провайдера — см. комментарий у
 * `noopApplyAttempt` выше. Для экрана сдачи (attempt/AttemptScreen.tsx):
 * в проде он всегда внутри MyExamsProvider (AppShell.tsx → cabinetRoutes.tsx),
 * но его собственный тест рендерит его в изоляции, без всей оболочки —
 * `useMyExams()` там бы просто бросал. */
export function useMyExamsApplyAttempt(): (attempt: ExamAttemptDto) => void {
  const ctx = useContext(MyExamsContext);
  return ctx?.applyAttempt ?? noopApplyAttempt;
}
