// Число раздела «Занятия» (docs/PLAN.md §14 слой 3.5, CLAUDE.md «Продуктовая
// фича = число в своём разделе») — по образцу
// exam-items/useExamItemStatsSummary.ts. `error` наружу не отдаём: сбой
// загрузки этого числа не должен ломать экран баннером — PlanningScreen.tsx
// просто не показывает строку, когда summary ещё null (см. комментарий там).
import type { LessonRecordingSummaryDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить число занятий с записью.';

export function useLessonRecordingSummary(): LessonRecordingSummaryDto | null {
  const { data } = useAbortableFetch(
    (signal) => apiRoute('GET /lessons/recording-summary', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  return data;
}
