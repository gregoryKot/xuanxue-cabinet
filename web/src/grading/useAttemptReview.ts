// Данные экрана проверки — карточка попытки (`GET /attempts/:id/review`) и
// отправка оценки (`PUT /attempts/:id/grading`, ТЗ 4.6, п.2). Read-after-write
// (CLAUDE.md) соблюдён без второго запроса: PUT возвращает AttemptReviewDto
// целиком (ADR-0087), и applyData кладёт этот ответ на экран — обновлённая
// `grading` всё так же приходит с сервера, а не собирается на клиенте из
// того, что мы сами отправили. Видео (ручная отметка, «Прислать мне в Telegram») —
// useAttemptReviewMedia.ts (вынесено оттуда же, чтобы этот файл не пух —
// CLAUDE.md «Храповики»): зовём хук и отдаём наружу тем же составом полей,
// что раньше, поэтому AttemptReviewScreen.tsx в этой части не меняется.
import { useCallback, useState } from 'react';
import { type AttemptReviewDto, type PutGradingInput } from '@xuanxue/shared';
import { attemptReviewPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import {
  useAttemptReviewMedia,
  type UseAttemptReviewMediaResult,
} from './useAttemptReviewMedia';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить карточку проверки. Попробуйте ещё раз.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить оценку. Попробуйте ещё раз.';

export interface UseAttemptReviewResult extends UseAttemptReviewMediaResult {
  review: AttemptReviewDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  submitGrading: (input: PutGradingInput) => Promise<boolean>;
  saving: boolean;
  saveError: FormError | null;
}

export function useAttemptReview(attemptId: string): UseAttemptReviewResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiFetch<AttemptReviewDto>(attemptReviewPath(attemptId), { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<FormError | null>(null);

  const submitGrading = useCallback(
    async (input: PutGradingInput): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        const next = await apiFetch<AttemptReviewDto>(`/attempts/${attemptId}/grading`, {
          method: 'PUT',
          body: input,
        });
        applyData(next);
        return true;
      } catch (err) {
        setSaveError(errorFrom(err, SAVE_ERROR_MESSAGE));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [attemptId, applyData],
  );

  const media = useAttemptReviewMedia(attemptId, reload);

  return {
    review: data,
    loading,
    error,
    reload,
    submitGrading,
    saving,
    saveError,
    ...media,
  };
}
