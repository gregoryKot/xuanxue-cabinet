// Данные экрана сдачи — сама попытка и её отправка (ТЗ п.2). Своего
// `GET /attempts/:id` у API нет (только список — `GET /attempts`,
// exam-attempts.controller.ts), поэтому берём список своих попыток и находим
// нужную по `id`: он уже применяет закрытие по дедлайну на сервере
// (closeIfExpiredAttempt) для каждой попытки списка, значит статус в ответе —
// правда на момент запроса, а не то, что было при старте.
import { useCallback, useState } from 'react';
import { ATTEMPT_NOT_FOUND_MESSAGE, type ExamAttemptDto } from '@xuanxue/shared';
import { ATTEMPTS_LIST_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { replacedById } from '../lib/listPatch';
import { errorFrom, type FormError } from '../components/FormServerError';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить попытку. Обновите страницу.';
const SUBMIT_ERROR_MESSAGE = 'Не удалось отправить экзамен. Попробуйте ещё раз.';

export interface UseAttemptResult {
  attempt: ExamAttemptDto | null;
  /** Список загрузился, но такой попытки в нём нет — не путать с `error`
   * (сетевым сбоем): своя чужая или несуществующая попытка тоже даёт эту
   * ветку, текст один и тот же, что у API (ATTEMPT_NOT_FOUND_MESSAGE). */
  notFound: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Тихое перечитывание без скелетона и баннера ошибки (useAbortableFetch.ts,
   * ADR-0076) — фоновый опрос, пока ждём видео-ответ из Telegram
   * (useAttemptVideoPoll.ts): бот принимает видео мимо вкладки, и без этого
   * поля экран узнал бы о нём только после ручной перезагрузки страницы. */
  refresh: () => Promise<void>;
  submit: () => Promise<void>;
  submitting: boolean;
  submitError: FormError | null;
}

export function useAttempt(attemptId: string): UseAttemptResult {
  const { data, loading, error, reload, refresh, applyData } = useAbortableFetch(
    (signal) => apiFetch<ExamAttemptDto[]>(ATTEMPTS_LIST_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const attempt = data?.find((item) => item.id === attemptId) ?? null;
  const notFound = data !== null && attempt === null;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<FormError | null>(null);

  // Никогда не бросает — ConfirmDialog закрывает себя после `onConfirm`
  // независимо от исхода (components/ConfirmDialog.tsx), сбой должен остаться
  // виден на самом экране сдачи, а не пропасть вместе с диалогом.
  //
  // Правка списка из ответа записи, не отдельный reload() (ADR-0094):
  // `POST /attempts/:id/submit` уже возвращает свежий ExamAttemptDto
  // (exam-attempts.controller.ts), второй `GET` того же списка не нужен.
  // Приём годится именно для ATTEMPTS_LIST_PATH — проверено чтением
  // ExamAttemptsService.list (exam-attempts.service.ts), полный разбор
  // условия — web/src/lib/listPatch.ts: путь не передаёт `status` в query, а
  // фильтр по статусу сервис применяет, только если он пришёл (`if
  // (query.status !== undefined) filter.status = ...`) — сдача экзамена
  // элемент из выборки не выкидывает; сортировка — `startedAt: -1`, а
  // submit() меняет `status`/`submittedAt`, не `startedAt` — место строки в
  // уже показанном списке не сдвигается.
  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const next = await apiFetch<ExamAttemptDto>(`/attempts/${attemptId}/submit`, {
        method: 'POST',
      });
      applyData((prev) => replacedById(prev, next));
    } catch (err) {
      setSubmitError(errorFrom(err, SUBMIT_ERROR_MESSAGE));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, applyData]);

  return {
    attempt,
    notFound,
    loading,
    error: error ?? (notFound ? ATTEMPT_NOT_FOUND_MESSAGE : null),
    reload,
    refresh,
    submit,
    submitting,
    submitError,
  };
}
