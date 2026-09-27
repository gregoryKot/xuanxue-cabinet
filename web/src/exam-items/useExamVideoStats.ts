// Число видео вопросов/вариантов для раздела «Экзамены» (CLAUDE.md
// «Продуктовая фича = число в своём разделе», ADR-0133) — по образцу
// useExamImageStats.ts.
import type { ExamVideoStatsDto } from '@xuanxue/shared';
import { EXAM_VIDEO_STATS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить число видео. Попробуйте ещё раз.';

export interface UseExamVideoStatsResult {
  stats: ExamVideoStatsDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExamVideoStats(): UseExamVideoStatsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<ExamVideoStatsDto>(EXAM_VIDEO_STATS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { stats: data, loading, error, reload };
}
