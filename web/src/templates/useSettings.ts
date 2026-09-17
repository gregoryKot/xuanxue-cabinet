// Настройки школы — шаблоны постов (docs/PLAN.md §6 «Шаблоны»). После
// сохранения перечитываем (CLAUDE.md «Read-after-write»): экран синхронизирует
// свою копию текста с сохранённой по `updatedAt` (TemplatesScreen.tsx).
import { useCallback } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { SETTINGS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить настройки. Попробуйте ещё раз.';

export interface UseSettingsResult {
  settings: SettingsDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<SettingsDto>(SETTINGS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const update = useCallback(
    async (input: UpdateSettingsInput) => {
      await apiFetch(SETTINGS_PATH, { method: 'PATCH', body: input });
      await reload();
    },
    [reload],
  );

  return { settings: data, loading, error, reload, update };
}
