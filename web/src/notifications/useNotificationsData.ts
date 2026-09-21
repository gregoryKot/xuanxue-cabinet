// Данные центра уведомлений (ADR-0063) — лента (`/me/inbox`)
// плюс новые задания с экрана «Задания»: у ученика с одним новым экзаменом и
// без единого непрочитанного уведомления пилюля у колокольчика не должна
// быть пустой, поэтому оба источника складываются в один счётчик.
// NotificationsProvider раздаёт этот же хук значку в оболочке и экрану
// `/notifications` через один контекст — иначе «Прочитать все» на экране не
// погасило бы цифру на значке до следующего похода в сеть.
//
// Опрос (ADR-0076): кабинет ставится на телефон как приложение, вкладку
// неделями не перезагружают — без фонового перечитывания счётчик застыл бы на
// значении первой отрисовки оболочки.
import { useCallback, useMemo } from 'react';
import type { InboxPageDto, MeDto, MyExamDto, NotificationDto } from '@xuanxue/shared';
import {
  NOTIFICATIONS_FEED_PATH,
  NOTIFICATIONS_READ_ALL_PATH,
  notificationReadPath,
} from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { isTeacher } from '../app/screenAccess';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { usePollWhileVisible } from '../hooks/usePollWhileVisible';
import { getExamAction } from '../student/examAttemptState';
import { useMyExams } from '../student/useMyExams';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить уведомления. Попробуйте ещё раз.';

/** Раз в минуту, пока вкладка видима (ADR-0076) — ритм, который ADR-0063 уже
 * назвал, объясняя, почему у пилюли нет `aria-live`. Чаще — лишние запросы
 * ради цифры, которую посекундно никто не ждёт; реже — значок заметно
 * отстаёт от того, что уже произошло (пришло уведомление, ученик начал
 * задание). */
export const NOTIFICATIONS_POLL_INTERVAL_MS = 60_000;

export interface NotificationsData {
  /** `null` — лента ещё не загружена. */
  items: NotificationDto[] | null;
  /** Непрочитанные строки во всей ленте, не только на этой странице — число
   * с сервера (`InboxPageDto.unreadCount`). Нужно отдельно от `count`: им
   * решается, показывать ли «Прочитать все», которое новых заданий не
   * касается. */
  unreadCount: number;
  /** Задания, к которым ученик ещё не приступал; у штата школы — всегда
   * пусто (ADR-0074). */
  newTasks: MyExamDto[];
  /** Непрочитанные строки плюс новые задания — число на пилюле у значка. */
  count: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotificationsData(me: MeDto | null): NotificationsData {
  const {
    data: page,
    loading,
    error,
    reload,
    refresh: refreshFeed,
  } = useAbortableFetch(
    (signal) => apiFetch<InboxPageDto>(NOTIFICATIONS_FEED_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // Экзамены сдаёт ученик (docs/PLAN.md §11), у штата школы попыток нет —
  // значит каждая опубликованная форма выглядела бы «новым заданием», и
  // цифра на значке врала бы. Роль решает сам запрос, а не фильтр после
  // него: у штата useMyExams выключен через `enabled`, а не отфильтрован
  // постфактум, поэтому лишнего похода в сеть на каждом экране штата тоже
  // больше нет (ADR-0074). Выключенный запрос оставляет exams === null, и
  // `exams ?? []` ниже даёт пустой список без второго критерия «новое».
  //
  // Тот же критерий, что рубрика «Новые задания» на экране «Задания»
  // (examAttemptState.getExamAction, splitNewTasks.ts) — свой запрос за
  // экзаменами и свой критерий «новое» не заводим, иначе две копии
  // разъехались бы на следующей правке экрана. У карточки задания нет флага
  // «прочитано» — сбой этого запроса не должен ронять ленту, она здесь
  // главное, задания — гость: значит, и loading/error ниже читаем только у неё.
  const { data: exams, refresh: refreshExams } = useMyExams({
    enabled: !isTeacher(me),
  });
  const newTasks = useMemo(
    () => (exams ?? []).filter((exam) => getExamAction(exam) === 'start'),
    [exams],
  );

  // Один тик обновляет оба источника: непрочитанные строки и «новое задание»
  // складываются в одну пилюлю значка, и перечитывание только ленты оставило
  // бы начатое учеником задание «новым» до перезагрузки вкладки, хотя
  // /me/exams уже вернул бы другой ответ. Опрос идёт мимо reload() —
  // публичный NotificationsData не расширяем, у reload() свои читатели
  // (markRead/markAllRead, баннер ошибки на экране).
  //
  // У штата школы запрос экзаменов выключен (`enabled` выше, ADR-0074), и
  // будить его тиком нельзя — иначе выключенный запрос вернулся бы раз в
  // минуту. Условие здесь не дублируется: тихий refresh() сам молчит на
  // выключенном хуке (useAbortableFetch.ts), поэтому правило живёт в одном
  // месте.
  const refreshCounters = useCallback(() => {
    void refreshFeed();
    void refreshExams();
  }, [refreshFeed, refreshExams]);
  usePollWhileVisible(refreshCounters, NOTIFICATIONS_POLL_INTERVAL_MS);

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
