// markRead/markAllRead центра уведомлений (ADR-0063) — вынесено из
// useNotificationsData.ts: там уже собран счётчик (лента + новые задания), и
// добавление try/catch на месте увело бы файл за 150 строк
// (check-file-size-ratchet.mjs). Оба действия делят один POST-обработчик,
// берут ответ записи через applyData, не через отдельный reload() (ADR-0087)
// — эндпоинты отдают InboxPageDto целиком, досчитывать unreadCount не нужно.
//
// До этого файла (аудит 2026-09-21, MED) у markRead/markAllRead не было
// try/catch, а NotificationsScreen.tsx звал их `void markRead(...)` без
// `.catch` — отказ на плохой связи был необработанным promise rejection, и
// «Прочитать все»/клик по строке молча ничего не делали.
import { useCallback, useState } from 'react';
import type { InboxPageDto } from '@xuanxue/shared';
import { NOTIFICATIONS_READ_ALL_PATH, notificationReadPath } from '../api/apiPaths';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

export interface NotificationsActions {
  /** Сбой markRead/markAllRead, отдельно от `error` (сбоя первой загрузки):
   * лента уже на экране, накрывать её баннером незачем — но что нажатие не
   * прошло, молчать не должно. Гасится reload(). */
  actionError: string | null;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/** `applyData`/`reloadFeed` — из useAbortableFetch хука ленты
 * (useNotificationsData.ts): здесь их только оборачивают try/catch и общим
 * текстом ошибки, сам запрос ленты не трогают. */
export function useNotificationsActions(
  applyData: (next: InboxPageDto) => void,
  reloadFeed: () => Promise<void>,
): NotificationsActions {
  const [actionError, setActionError] = useState<string | null>(null);

  // Общий обработчик — иначе try/catch и текст ошибки дублировались бы дважды
  // (jscpd, CLAUDE.md «Дубли и мёртвый код»).
  const readAndApply = useCallback(
    async (path: string) => {
      setActionError(null);
      try {
        applyData(await apiFetch<InboxPageDto>(path, { method: 'POST' }));
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      }
    },
    [applyData],
  );
  const markRead = useCallback(
    (id: string) => readAndApply(notificationReadPath(id)),
    [readAndApply],
  );
  const markAllRead = useCallback(
    () => readAndApply(NOTIFICATIONS_READ_ALL_PATH),
    [readAndApply],
  );

  // «Обновить» на баннере — что для сбоя загрузки, что для actionError —
  // начинает начисто: без сброса actionError баннер остался бы висеть даже
  // после того, как лента успешно перечиталась.
  const reload = useCallback(async () => {
    setActionError(null);
    await reloadFeed();
  }, [reloadFeed]);

  return { actionError, reload, markRead, markAllRead };
}
