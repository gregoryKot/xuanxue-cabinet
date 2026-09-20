// Данные центра уведомлений (ADR-0063) — лента (`/me/inbox`)
// плюс новые задания с экрана «Задания»: у ученика с одним новым экзаменом и
// без единого непрочитанного уведомления пилюля у колокольчика не должна
// быть пустой, поэтому оба источника складываются в один счётчик.
// NotificationsProvider раздаёт этот же хук значку в оболочке и экрану
// `/notifications` через один контекст — иначе «Прочитать все» на экране не
// погасило бы цифру на значке до следующего похода в сеть.
import { useCallback, useMemo } from 'react';
import type { InboxPageDto, MyExamDto, NotificationDto } from '@xuanxue/shared';
import {
  NOTIFICATIONS_FEED_PATH,
  NOTIFICATIONS_READ_ALL_PATH,
  notificationReadPath,
} from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { getExamAction } from '../student/examAttemptState';
import { useMyExams } from '../student/useMyExams';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить уведомления. Попробуйте ещё раз.';

export interface NotificationsData {
  /** `null` — лента ещё не загружена. */
  items: NotificationDto[] | null;
  /** Непрочитанные строки во всей ленте, не только на этой странице — число
   * с сервера (`InboxPageDto.unreadCount`). Нужно отдельно от `count`: им
   * решается, показывать ли «Прочитать все», которое новых заданий не
   * касается. */
  unreadCount: number;
  /** Задания, к которым ученик ещё не приступал. */
  newTasks: MyExamDto[];
  /** Непрочитанные строки плюс новые задания — число на пилюле у значка. */
  count: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotificationsData(): NotificationsData {
  const {
    data: page,
    loading,
    error,
    reload,
  } = useAbortableFetch(
    (signal) => apiFetch<InboxPageDto>(NOTIFICATIONS_FEED_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // Тот же критерий, что рубрика «Новые задания» на экране «Задания»
  // (examAttemptState.getExamAction, splitNewTasks.ts) — свой запрос за
  // экзаменами и свой критерий «новое» не заводим, иначе две копии
  // разъехались бы на следующей правке экрана. У карточки задания нет флага
  // «прочитано» — сбой этого запроса не должен ронять ленту, она здесь
  // главное, задания — гость: значит, и loading/error ниже читаем только у неё.
  const { data: exams } = useMyExams();
  const newTasks = useMemo(
    () => (exams ?? []).filter((exam) => getExamAction(exam) === 'start'),
    [exams],
  );

  const markRead = useCallback(
    async (id: string) => {
      await apiFetch(notificationReadPath(id), { method: 'POST' });
      await reload();
    },
    [reload],
  );

  const markAllRead = useCallback(async () => {
    await apiFetch(NOTIFICATIONS_READ_ALL_PATH, { method: 'POST' });
    await reload();
  }, [reload]);

  const unreadCount = page?.unreadCount ?? 0;

  return {
    items: page?.items ?? null,
    unreadCount,
    newTasks,
    count: unreadCount + newTasks.length,
    loading,
    error,
    reload,
    markRead,
    markAllRead,
  };
}
