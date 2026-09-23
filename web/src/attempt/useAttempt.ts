// Данные экрана сдачи — сама попытка и её отправка (ТЗ п.2). Своя попытка —
// своим адресом (`GET /attempts/:id`, ADR-0126), не список всех попыток:
// список читал и расшифровывал на сервере до 200 чужих снимков ради одной
// нужной строки — на показ экрана и на каждый тик фонового опроса
// (useAttemptVideoPoll.ts, раз в 15 с). Сервер применяет закрытие по
// дедлайну (closeIfExpiredAttempt) и на этом пути тоже, значит статус в
// ответе — правда на момент запроса, а не то, что было при старте.
import { useCallback, useState } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { attemptPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { errorFrom, type FormError } from '../components/FormServerError';
import { clearAttemptDraft } from './attemptLocalDraft';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить попытку. Обновите страницу.';
const SUBMIT_ERROR_MESSAGE = 'Не удалось отправить экзамен. Попробуйте ещё раз.';

export interface UseAttemptOptions {
  /** Зовётся с уже свежим DTO после успешной отправки — правка списка
   * `/me/exams` (MyExamsProvider.applyAttempt, ADR-0119): без неё карточка
   * на «Заданиях» ещё держит `lastAttempt.status: 'in_progress'», и
   * устаревшее «Продолжить» завело бы вторую, пустую попытку (отзыв
   * тестировщика 2026-09-22). Необязательный параметр, не импорт
   * MyExamsProvider отсюда — attempt/ не знает о student/, вызывающий
   * (AttemptScreen.tsx) сам решает, куда результат передать. */
  onSubmitted?: (attempt: ExamAttemptDto) => void;
}

export interface UseAttemptResult {
  attempt: ExamAttemptDto | null;
  loading: boolean;
  /** Чужая, несуществующая или сетевая ошибка — один и тот же текст с
   * сервера (ATTEMPT_NOT_FOUND_MESSAGE, ApiError.message для 404). */
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

export function useAttempt(
  attemptId: string,
  options: UseAttemptOptions = {},
): UseAttemptResult {
  const { onSubmitted } = options;
  const { data, loading, error, reload, refresh, applyData } = useAbortableFetch(
    (signal) => apiFetch<ExamAttemptDto>(attemptPath(attemptId), { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const attempt = data;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<FormError | null>(null);

  // Никогда не бросает — ConfirmDialog закрывает себя после `onConfirm`
  // независимо от исхода (components/ConfirmDialog.tsx), сбой должен остаться
  // виден на самом экране сдачи, а не пропасть вместе с диалогом.
  //
  // Правка попытки из ответа записи, не отдельный reload() (ADR-0087,
  // ADR-0094): `POST /attempts/:id/submit` уже возвращает свежий
  // ExamAttemptDto (exam-attempts.controller.ts), второй `GET` не нужен.
  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const next = await apiFetch<ExamAttemptDto>(`/attempts/${attemptId}/submit`, {
        method: 'POST',
      });
      applyData(next);
      // Тот же ответ правит и список «Заданий» — без него он ещё долю
      // секунды думает, что попытка in_progress (ADR-0119, комментарий
      // у UseAttemptOptions.onSubmitted выше).
      onSubmitted?.(next);
      // Отправлено — редактировать больше нечего, локальный черновик ответов
      // убирается целиком (attemptLocalDraft.ts, аудит 2026-09-21).
      clearAttemptDraft(attemptId);
    } catch (err) {
      setSubmitError(errorFrom(err, SUBMIT_ERROR_MESSAGE));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, applyData, onSubmitted]);

  return {
    attempt,
    loading,
    error,
    reload,
    refresh,
    submit,
    submitting,
    submitError,
  };
}
