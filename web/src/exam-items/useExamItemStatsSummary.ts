// Число «спотыкающихся» вопросов для подписи карточки-ссылки «Вопросы»
// (CLAUDE.md «Продуктовая фича = число в своём разделе», ExamsScreen.tsx) —
// по образцу grading/useGradingQueue.ts.
import type { ExamItemStatsSummaryDto } from '@xuanxue/shared';
import { EXAM_ITEM_STATS_SUMMARY_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить статистику вопросов. Попробуйте ещё раз.';

export interface UseExamItemStatsSummaryResult {
  summary: ExamItemStatsSummaryDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExamItemStatsSummary(): UseExamItemStatsSummaryResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) =>
      apiFetch<ExamItemStatsSummaryDto>(EXAM_ITEM_STATS_SUMMARY_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { summary: data, loading, error, reload };
}
