// markRead/markAllRead/dismiss центра уведомлений (ADR-0063) — вынесено из
// useNotificationsData.ts: там уже собран счётчик (лента + новые задания), и
// добавление try/catch на месте увело бы файл за 150 строк
// (check-file-size-ratchet.mjs). Все три действия делят один обработчик,
// берут ответ записи через applyData, не через отдельный reload() (ADR-0087)
// — эндпоинты отдают InboxPageDto целиком, досчитывать unreadCount не нужно.
//
// До этого файла (аудит 2026-09-21, MED) у markRead/markAllRead не было
// try/catch, а NotificationsScreen.tsx звал их `void markRead(...)` без
// `.catch` — отказ на плохой связи был необработанным promise rejection, и
// «Прочитать все»/клик по строке молча ничего не делали.
import { useCallback, useState } from 'react';
import type { InboxPageDto } from '@xuanxue/shared';
import {
  NOTIFICATIONS_READ_ALL_PATH,
  notificationItemPath,
  notificationReadPath,
} from '../api/apiPaths';
import { ApiError, apiFetch, NETWORK_ERROR_MESSAGE } from '../api/http';

// Только эти два метода зовёт этот файл — свой узкий тип вместо импорта
// внутреннего ApiMethod из http.ts (там он не экспортирован нарочно, наружу
// торчит только apiFetch).
type WriteMethod = 'POST' | 'DELETE';

export interface NotificationsActions {
  /** Сбой markRead/markAllRead/dismiss, отдельно от `error` (сбоя первой
   * загрузки): лента уже на экране, накрывать её баннером незачем — но что
   * действие не прошло, молчать не должно. Гасится reload(). */
  actionError: string | null;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Убрать уведомление из ленты (просьба владельца 2026-09-22,
   * SwipeRow.tsx) — необратимо для этого устройства, не архив. */
  dismiss: (id: string) => Promise<void>;
}

/** `applyData`/`reloadFeed` — из useAbortableFetch хука ленты
 * (useNotificationsData.ts): здесь их только оборачивают try/catch и общим
 * текстом ошибки, сам запрос ленты не трогают. */
export function useNotificationsActions(
  applyData: (next: InboxPageDto) => void,
  reloadFeed: () => Promise<void>,
): NotificationsActions {
  const [actionError, setActionError] = useState<string | null>(null);

  // Общий обработчик — иначе try/catch и текст ошибки дублировались бы трижды
  // (jscpd, CLAUDE.md «Дубли и мёртвый код»). Метод — параметром: markRead/
  // markAllRead шлют POST, dismiss — DELETE, конверт ответа и ошибки у всех
  // общий (InboxPageDto целиком).
  const writeAndApply = useCallback(
    async (path: string, method: WriteMethod = 'POST') => {
      setActionError(null);
      try {
        applyData(await apiFetch<InboxPageDto>(path, { method }));
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE);
      }
    },
    [applyData],
  );
  const markRead = useCallback(
    (id: string) => writeAndApply(notificationReadPath(id)),
    [writeAndApply],
  );
  const markAllRead = useCallback(
    () => writeAndApply(NOTIFICATIONS_READ_ALL_PATH),
    [writeAndApply],
  );
  const dismiss = useCallback(
    (id: string) => writeAndApply(notificationItemPath(id), 'DELETE'),
    [writeAndApply],
  );

  // «Обновить» на баннере — что для сбоя загрузки, что для actionError —
  // начинает начисто: без сброса actionError баннер остался бы висеть даже
  // после того, как лента успешно перечиталась.
  const reload = useCallback(async () => {
    setActionError(null);
    await reloadFeed();
  }, [reloadFeed]);

  return { actionError, reload, markRead, markAllRead, dismiss };
}
