// Заготовки частых комментариев при проверке (слой 4.6, PLAN §11,
// ADR-0041) — список читают и «Экзамены» (число раздела,
// exams/ExamsSectionStats.tsx), и сама карточка проверки
// (GradingCommentPresets.tsx): один хук на оба места (CLAUDE.md «Одна
// механика — один компонент»), по образцу useGradingQueue.ts. Ошибку
// create/remove ловит вызывающий компонент сам (по образцу usePeople.ts) —
// у списка заготовок нет отдельной страницы с общим состоянием сохранения.
import { useCallback } from 'react';
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import {
  entityPath,
  GRADING_PRESETS_LIST_PATH,
  GRADING_PRESETS_PATH,
} from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить заготовки. Попробуйте ещё раз.';

export interface UseGradingPresetsResult {
  presets: GradingCommentPresetDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Read-after-write: список перечитывается заново после сохранения. */
  create: (text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useGradingPresets(): UseGradingPresetsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) =>
      apiFetch<GradingCommentPresetDto[]>(GRADING_PRESETS_LIST_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const create = useCallback(
    async (text: string) => {
      await apiFetch(GRADING_PRESETS_PATH, { method: 'POST', body: { text } });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(entityPath(GRADING_PRESETS_PATH, id), { method: 'DELETE' });
      await reload();
    },
    [reload],
  );

  return { presets: data, loading, error, reload, create, remove };
}
