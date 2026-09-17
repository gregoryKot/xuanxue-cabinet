// Число картинок вариантов ответа для раздела «Экзамены» (CLAUDE.md
// «Продуктовая фича = число в своём разделе», ADR-0035 «Последствия») — по
// образцу useExamItemStatsSummary.ts.
import type { ExamImageStatsDto } from '@xuanxue/shared';
import { EXAM_IMAGE_STATS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить число картинок. Попробуйте ещё раз.';

export interface UseExamImageStatsResult {
  stats: ExamImageStatsDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExamImageStats(): UseExamImageStatsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamImageStatsDto>(EXAM_IMAGE_STATS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { stats: data, loading, error, reload };
}
