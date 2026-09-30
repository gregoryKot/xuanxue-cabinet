// Данные блока «О каких занятиях» на экране настроек (ADR-0162) — выбор
// человека и список занятий школы одним `GET`, запись — `PUT` с выбором целиком.
// `PUT` отдаёт то же, что `GET` (MyLessonNotificationsDto), поэтому ответ кладётся
// на экран напрямую (`applyData`), а не перечитывается вторым запросом
// (ADR-0087, check-write-then-reload). Оптимистичной отрисовки нет: контрол
// остаётся в прежнем положении, пока не пришёл ответ, тем же приёмом, что
// useNotificationPrefs.ts.
import { useCallback, useState } from 'react';
import type { LessonScope, LessonScopeClassDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия. Попробуйте ещё раз.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';

export interface UseLessonScopeResult {
  scope: LessonScope | null;
  classes: LessonScopeClassDto[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Идёт запись — контролы блока на это время выключены. */
  saving: boolean;
  saveError: string | null;
  save: (next: LessonScope) => Promise<void>;
}

export function useLessonScope(): UseLessonScopeResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /me/notifications/lessons', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (next: LessonScope) => {
      setSaveError(null);
      setSaving(true);
      try {
        applyData(await apiRoute('PUT /me/notifications/lessons/scope', { body: next }));
      } catch (err) {
        // Текст ответа (например «Такого занятия больше нет в расписании…»)
        // уже написан для человека — показываем его, а не общую фразу.
        setSaveError(err instanceof ApiError ? err.message : SAVE_ERROR_MESSAGE);
      } finally {
        setSaving(false);
      }
    },
    [applyData],
  );

  return {
    scope: data?.scope ?? null,
    classes: data?.classes ?? [],
    loading,
    error,
    reload,
    saving,
    saveError,
    save,
  };
}
