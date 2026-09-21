// Заготовки частых комментариев при проверке (слой 4.6, PLAN §11,
// ADR-0041) — список читают и «Экзамены» (число раздела,
// exams/ExamsSectionStats.tsx), и сама карточка проверки
// (GradingCommentPresets.tsx): один хук на оба места (CLAUDE.md «Одна
// механика — один компонент»), по образцу useGradingQueue.ts. Ошибку
// create/remove ловит вызывающий компонент сам (по образцу usePeople.ts) —
// у списка заготовок нет отдельной страницы с общим состоянием сохранения.
//
// `POST`/`DELETE` не перечитывают список отдельным `GET` (ADR-0087): `POST`
// уже возвращает созданную заготовку, `DELETE` отвечает `204`. `GET
// /grading-presets` (GradingPresetsService.list) без фильтра сортирует
// `.sort({ createdAt: 1 })` — по возрастанию, поэтому у новой заготовки
// `createdAt` «сейчас» больше, чем у всех уже показанных, и её место — в
// конце списка, туда же кладёт `appended` (полный разбор, включая
// предупреждение для каких списков так нельзя, — web/src/lib/listPatch.ts).
// Read-after-write (CLAUDE.md «Тесты») соблюдён: на экране остаётся то, что
// сервер вернул после записи, — из ответа самой записи.
import { useCallback } from 'react';
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import {
  entityPath,
  GRADING_PRESETS_LIST_PATH,
  GRADING_PRESETS_PATH,
} from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { appended, withoutId } from '../lib/listPatch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить заготовки. Попробуйте ещё раз.';

export interface UseGradingPresetsResult {
  presets: GradingCommentPresetDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useGradingPresets(): UseGradingPresetsResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) =>
      apiFetch<GradingCommentPresetDto[]>(GRADING_PRESETS_LIST_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const create = useCallback(
    async (text: string) => {
      const next = await apiFetch<GradingCommentPresetDto>(GRADING_PRESETS_PATH, {
        method: 'POST',
        body: { text },
      });
      applyData((prev) => appended(prev, next));
    },
    [applyData],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(entityPath(GRADING_PRESETS_PATH, id), { method: 'DELETE' });
      applyData((prev) => withoutId(prev, id));
    },
    [applyData],
  );

  return { presets: data, loading, error, reload, create, remove };
}
