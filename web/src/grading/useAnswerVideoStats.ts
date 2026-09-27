// Число видео-ответов учеников и их объём для раздела «Экзамены» (CLAUDE.md
// «Продуктовая фича = число в своём разделе», ADR-0137) — по образцу
// exam-items/useExamVideoStats.ts (там — видео вопросов, другая коллекция).
import type { AnswerVideoStatsDto } from '@xuanxue/shared';
import { ANSWER_VIDEO_STATS_PATH } from '../api/answerVideoPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить число видео-ответов. Попробуйте ещё раз.';

export interface UseAnswerVideoStatsResult {
  stats: AnswerVideoStatsDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useAnswerVideoStats(): UseAnswerVideoStatsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<AnswerVideoStatsDto>(ANSWER_VIDEO_STATS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return { stats: data, loading, error, reload };
}
