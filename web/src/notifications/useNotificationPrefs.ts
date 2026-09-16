// Данные экрана «Уведомления» — какие виды доступны этому человеку по его
// ролям и какие включены сейчас (CLAUDE.md «Read-after-write»): после PATCH
// состояние перечитывается заново, тем же приёмом, что usePeople делает
// с ролями — не рисуем переключатель заранее, показываем результат уже
// с сервера (ТЗ notifications-web.md, п.4).
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
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<NotificationPrefsDto>(NOTIFICATION_PREFS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  const setEnabled = useCallback(
    async (kind: NotificationKind, enabled: boolean) => {
      await apiFetch(NOTIFICATION_PREFS_PATH, {
        method: 'PATCH',
        body: { kind, enabled },
      });
      await reload();
    },
    [reload],
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
