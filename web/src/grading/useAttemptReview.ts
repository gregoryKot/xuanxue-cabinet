// Данные экрана проверки — карточка попытки (`GET /attempts/:id/review`) и
// отправка оценки (`PUT /attempts/:id/grading`, ТЗ 4.6, п.2). Read-after-write
// (CLAUDE.md): после сохранения перечитываем карточку — обновлённая `grading`
// приходит уже с сервера, а не собирается на клиенте из того, что мы сами
// отправили.
import { useCallback, useState } from 'react';
import {
  type AttemptReviewDto,
  type ExamMediaDto,
  type PutGradingInput,
} from '@xuanxue/shared';
import { attemptReviewPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить карточку проверки. Попробуйте ещё раз.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить оценку. Попробуйте ещё раз.';
const MARK_MEDIA_ERROR_MESSAGE = 'Не удалось отметить видео. Попробуйте ещё раз.';

interface MarkMediaState {
  pending: boolean;
  error: FormError | null;
}

const IDLE_MARK_MEDIA_STATE: MarkMediaState = { pending: false, error: null };

/** Всё, что нужно видео-вопросу карточки проверки (ADR-0037): собирается
 * один раз в AttemptReviewScreen.tsx и идёт вниз одним объектом
 * (AttemptReviewAnswers → AttemptReviewBlock → AttemptReviewQuestion, тот же
 * приём, что `AttemptVideoControls` в attempt/useAttemptMedia.ts), а не
 * россыпью пропсов (CLAUDE.md «параметров больше трёх — объект»). */
export interface AttemptReviewVideoControls {
  /** Всё видео попытки — вопрос сам выбирает своё по `itemId`, «без
   * вопроса» — записи без него (AttemptReviewAnswers.tsx). */
  media: ExamMediaDto[];
  markMediaManual: (itemId: string) => Promise<boolean>;
  markMediaStateFor: (itemId: string) => MarkMediaState;
}

export interface UseAttemptReviewResult {
  review: AttemptReviewDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  submitGrading: (input: PutGradingInput) => Promise<boolean>;
  saving: boolean;
  saveError: FormError | null;
  /** Третий путь привязки видео — учитель отмечает вручную (ADR-0023), у
   * своего вопроса (ADR-0037): без `itemId` нечего отмечать. */
  markMediaManual: (itemId: string) => Promise<boolean>;
  /** Состояние отметки конкретного вопроса — не общее на карточку: два
   * видео-вопроса отмечаются по одному, «занята»/ошибка видны только у
   * того, что отправляли (тот же приём, что `linkStateFor` в
   * attempt/useAttemptMedia.ts). */
  markMediaStateFor: (itemId: string) => MarkMediaState;
}

export function useAttemptReview(attemptId: string): UseAttemptReviewResult {
  const { data, loading, error, reload } = useAbortableFetch(
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

  // Одно состояние на хук, а не Map по itemId: отметить можно только один
  // вопрос за раз (вторая кнопка не нажата, пока первая не ответила) — этого
  // достаточно, чтобы различить «свой» вопрос и остальные.
  const [markState, setMarkState] = useState<
    (MarkMediaState & { itemId: string }) | null
  >(null);

  // Read-after-write: перечитываем карточку на успех — `media` в ответе уже
  // содержит новую запись `kind: 'manual'` с сервера, не собранную на клиенте.
  const markMediaManual = useCallback(
    async (itemId: string): Promise<boolean> => {
      setMarkState({ itemId, pending: true, error: null });
      try {
        await apiFetch(`/attempts/${attemptId}/media/manual`, {
          method: 'POST',
          body: { itemId },
        });
        await reload();
        setMarkState(null);
        return true;
      } catch (err) {
        setMarkState({
          itemId,
          pending: false,
          error: errorFrom(err, MARK_MEDIA_ERROR_MESSAGE),
        });
        return false;
      }
    },
    [attemptId, reload],
  );

  const markMediaStateFor = useCallback(
    (itemId: string): MarkMediaState => {
      if (!markState || markState.itemId !== itemId) return IDLE_MARK_MEDIA_STATE;
      return { pending: markState.pending, error: markState.error };
    },
    [markState],
  );

  return {
    review: data,
    loading,
    error,
    reload,
    submitGrading,
    saving,
    saveError,
    markMediaManual,
    markMediaStateFor,
  };
}
