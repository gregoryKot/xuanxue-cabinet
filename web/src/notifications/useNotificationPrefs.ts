// Данные экрана «Уведомления» — какие виды доступны этому человеку по его
// ролям и какие включены сейчас. PATCH /me/notifications уже возвращает
// полный NotificationPrefsDto (notification-prefs.controller.ts: «бот и
// кабинет обновляют экран настроек одним ответом, без отдельного GET
// следом») — applyData() кладёт этот ответ на экран напрямую, второй запрос
// за тем же самым не нужен. Read-after-write (CLAUDE.md) не нарушается: мы
// показываем ровно то, что сервер вернул после записи, — просто это тело
// ответа PATCH, а не отдельный GET следом (отзыв владельца 2026-09-21:
// переключатель ждал оба запроса подряд и стоял серым 1–2 секунды).
import { useCallback } from 'react';
import {
  defaultNotifications,
  type MeDto,
  type NotificationKind,
  type NotificationPrefsDto,
} from '@xuanxue/shared';
import { NOTIFICATION_PREFS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить настройки уведомлений. Попробуйте ещё раз.';

export interface UseNotificationPrefsResult {
  /** Виды, доступные этому человеку по его ролям — остальные не показываем. */
  kinds: NotificationKind[];
  enabled: NotificationKind[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setEnabled: (kind: NotificationKind, enabled: boolean) => Promise<void>;
}

export function useNotificationPrefs(me: MeDto | null): UseNotificationPrefsResult {
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiFetch<NotificationPrefsDto>(NOTIFICATION_PREFS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const setEnabled = useCallback(
    async (kind: NotificationKind, enabled: boolean) => {
      const next = await apiFetch<NotificationPrefsDto>(NOTIFICATION_PREFS_PATH, {
        method: 'PATCH',
        body: { kind, enabled },
      });
      applyData(next);
    },
    [applyData],
  );

  return {
    kinds: defaultNotifications(me?.roles ?? []),
    enabled: data?.enabled ?? null,
    loading,
    error,
    reload,
    setEnabled,
  };
}
