// Настройки школы — шаблоны постов, адрес сайта, время предпросмотра, рубильник
// «после оплаты» (docs/PLAN.md §6 «Шаблоны»). PATCH /settings уже возвращает
// полный SettingsDto (settings.controller.ts) — applyData() кладёт этот ответ
// на экран напрямую, второй запрос за тем же самым не нужен. Read-after-write
// (CLAUDE.md) не нарушается: мы показываем ровно то, что сервер вернул после
// записи, — просто это тело ответа PATCH, а не отдельный GET следом (отзыв
// владельца 2026-09-21: переключатель ждал оба запроса подряд и стоял серым
// 1–2 секунды). Свежий `updatedAt` в этом же ответе по-прежнему запускает
// синхронизацию своей копии текста у потребителей (TemplatesScreen.tsx,
// useSchoolSiteField.ts, usePreviewMinutesField.ts).
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
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiFetch<SettingsDto>(SETTINGS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const update = useCallback(
    async (input: UpdateSettingsInput) => {
      const next = await apiFetch<SettingsDto>(SETTINGS_PATH, {
        method: 'PATCH',
        body: input,
      });
      applyData(next);
    },
    [applyData],
  );

  return { settings: data, loading, error, reload, update };
}
