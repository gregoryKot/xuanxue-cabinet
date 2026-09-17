// Данные статистики одного вопроса (ТЗ 4.8) — по образцу
// grading/useGradingQueue.ts. Хук монтируется вместе с ExamItemStats.tsx —
// сам компонент рендерится по нажатию «Статистика» (ExamItemCard.tsx), не
// при каждом открытии списка (CLAUDE.md «Продуктовая фича = число в своём
// разделе»): запрос уходит только тогда, а не для каждой карточки списка.
import type { ExamItemStatsDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить статистику вопроса. Попробуйте ещё раз.';

export interface UseExamItemStatsResult {
  stats: ExamItemStatsDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExamItemStats(itemId: string): UseExamItemStatsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamItemStatsDto>(`/exam-items/${itemId}/stats`, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { stats: data, loading, error, reload };
}
