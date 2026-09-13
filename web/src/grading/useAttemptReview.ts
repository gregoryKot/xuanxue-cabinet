// Данные экрана проверки — карточка попытки (`GET /attempts/:id/review`) и
// отправка оценки (`PUT /attempts/:id/grading`, ТЗ 4.6, п.2). Read-after-write
// (CLAUDE.md): после сохранения перечитываем карточку — обновлённая `grading`
// приходит уже с сервера, а не собирается на клиенте из того, что мы сами
// отправили.
import { useCallback, useState } from 'react';
import { type AttemptReviewDto, type PutGradingInput } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить карточку проверки. Попробуйте ещё раз.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить оценку. Попробуйте ещё раз.';

export interface UseAttemptReviewResult {
  review: AttemptReviewDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  submitGrading: (input: PutGradingInput) => Promise<boolean>;
  saving: boolean;
  saveError: FormError | null;
}

export function useAttemptReview(attemptId: string): UseAttemptReviewResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<AttemptReviewDto>(`/attempts/${attemptId}/review`, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<FormError | null>(null);

  const submitGrading = useCallback(
    async (input: PutGradingInput): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        await apiFetch(`/attempts/${attemptId}/grading`, { method: 'PUT', body: input });
        await reload();
        return true;
      } catch (err) {
        setSaveError(errorFrom(err, SAVE_ERROR_MESSAGE));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [attemptId, reload],
  );

  return { review: data, loading, error, reload, submitGrading, saving, saveError };
}
