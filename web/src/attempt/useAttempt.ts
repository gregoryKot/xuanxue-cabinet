// Данные экрана сдачи — сама попытка и её отправка (ТЗ п.2). Своего
// `GET /attempts/:id` у API нет (только список — `GET /attempts`,
// exam-attempts.controller.ts), поэтому берём список своих попыток и находим
// нужную по `id`: он уже применяет закрытие по дедлайну на сервере
// (closeIfExpiredAttempt) для каждой попытки списка, значит статус в ответе —
// правда на момент запроса, а не то, что было при старте.
import { useCallback, useState } from 'react';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  LIST_LIMIT_MAX,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { errorFrom, type FormError } from '../components/FormServerError';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить попытку. Обновите страницу.';
const SUBMIT_ERROR_MESSAGE = 'Не удалось отправить экзамен. Попробуйте ещё раз.';
const ADD_MEDIA_LINK_ERROR_MESSAGE = 'Не удалось сохранить ссылку. Попробуйте ещё раз.';

export interface UseAttemptResult {
  attempt: ExamAttemptDto | null;
  /** Список загрузился, но такой попытки в нём нет — не путать с `error`
   * (сетевым сбоем): своя чужая или несуществующая попытка тоже даёт эту
   * ветку, текст один и тот же, что у API (ATTEMPT_NOT_FOUND_MESSAGE). */
  notFound: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  submit: () => Promise<void>;
  submitting: boolean;
  submitError: FormError | null;
  /** Запасной путь привязки видео — ссылка (ADR-0023, экран «Отправлено»).
   * `true` на успех — форма очищает поле только тогда, не по факту вызова. */
  addMediaLink: (url: string) => Promise<boolean>;
  addingMediaLink: boolean;
  addMediaLinkError: FormError | null;
}

export function useAttempt(attemptId: string): UseAttemptResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) =>
      apiFetch<ExamAttemptDto[]>(`/attempts?limit=${LIST_LIMIT_MAX}`, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const attempt = data?.find((item) => item.id === attemptId) ?? null;
  const notFound = data !== null && attempt === null;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<FormError | null>(null);

  // Никогда не бросает — ConfirmDialog закрывает себя после `onConfirm`
  // независимо от исхода (components/ConfirmDialog.tsx), сбой должен остаться
  // виден на самом экране сдачи, а не пропасть вместе с диалогом.
  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch(`/attempts/${attemptId}/submit`, { method: 'POST' });
      await reload();
    } catch (err) {
      setSubmitError(errorFrom(err, SUBMIT_ERROR_MESSAGE));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, reload]);

  const [addingMediaLink, setAddingMediaLink] = useState(false);
  const [addMediaLinkError, setAddMediaLinkError] = useState<FormError | null>(null);

  // Read-after-write: перечитываем попытку на успех, `media` в ответе — уже
  // с новой ссылкой (CLAUDE.md «Read-after-write»), а не собрана на клиенте
  // из того, что сами отправили.
  const addMediaLink = useCallback(
    async (url: string): Promise<boolean> => {
      setAddingMediaLink(true);
      setAddMediaLinkError(null);
      try {
        await apiFetch(`/attempts/${attemptId}/media/link`, {
          method: 'POST',
          body: { url },
        });
        await reload();
        return true;
      } catch (err) {
        setAddMediaLinkError(errorFrom(err, ADD_MEDIA_LINK_ERROR_MESSAGE));
        return false;
      } finally {
        setAddingMediaLink(false);
      }
    },
    [attemptId, reload],
  );

  return {
    attempt,
    notFound,
    loading,
    error: error ?? (notFound ? ATTEMPT_NOT_FOUND_MESSAGE : null),
    reload,
    submit,
    submitting,
    submitError,
    addMediaLink,
    addingMediaLink,
    addMediaLinkError,
  };
}
