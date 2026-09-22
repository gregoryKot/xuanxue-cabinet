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
//
// markRead/markAllRead — в useNotificationsActions.ts (try/catch и
// actionError, аудит 2026-09-21, MED): здесь их только собирают из
// applyData/reloadFeed ленты, вынесено, чтобы этот файл не перерос 150 строк
// (check-file-size-ratchet.mjs).
import { useCallback, useMemo } from 'react';
import {
  getMyExamAction,
  type InboxPageDto,
  type MeDto,
  type MyExamDto,
  type NotificationDto,
} from '@xuanxue/shared';
import { NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { isTeacher } from '../app/screenAccess';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { usePollWhileVisible } from '../hooks/usePollWhileVisible';
import { useMyExams } from '../student/MyExamsProvider';
import {
  useNotificationsActions,
  type NotificationsActions,
} from './useNotificationsActions';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить уведомления. Попробуйте ещё раз.';

/** Раз в минуту, пока вкладка видима (ADR-0076) — ритм, который ADR-0063 уже
 * назвал, объясняя, почему у пилюли нет `aria-live`. Чаще — лишние запросы
 * ради цифры, которую посекундно никто не ждёт; реже — значок заметно
 * отстаёт от того, что уже произошло (пришло уведомление, ученик начал
 * задание). */
export const NOTIFICATIONS_POLL_INTERVAL_MS = 60_000;

export interface NotificationsData extends NotificationsActions {
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
}

export function useNotificationsData(me: MeDto | null): NotificationsData {
  const {
    data: page,
    loading,
    error,
    reload: reloadFeed,
    refresh: refreshFeed,
    applyData,
  } = useAbortableFetch(
    (signal) => apiFetch<InboxPageDto>(NOTIFICATIONS_FEED_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const { actionError, reload, markRead, markAllRead, dismiss } = useNotificationsActions(
    applyData,
    reloadFeed,
  );

  // Экзамены приходят из общего контекста (MyExamsProvider, ADR-0063) —
  // своего запроса за ними здесь нет, TasksScreen.tsx и этот хук делят один
  // GET /me/exams. Сам запрос провайдер выключает у штата школы везде, кроме
  // «/tasks» (ADR-0074) — там список нужен самому экрану, не счётчику, и
  // отключить его нельзя. Поэтому здесь остаётся вторая, лёгкая часть того
  // же правила: роль решает, что из ответа значит «новое задание» — штат
  // попыток не сдаёт (docs/PLAN.md §11), и его формы в счётчик не идут, даже
  // если общий запрос сейчас включён ради «/tasks» (тот же человек в роли
  // помощника учителя видит список на экране, но не в счётчике — «Контекст»
  // ADR-0074). У карточки задания нет флага «прочитано» — сбой этого запроса
  // не должен ронять ленту, она здесь главное, задания — гость: значит, и
  // loading/error ниже читаем только у неё.
  //
  // «Новое» — то же `getMyExamAction === 'start'` (shared/src/my-exams.ts),
  // по которому карточка задания рисует кнопку «Начать»: своего критерия
  // новизны здесь нет, иначе две копии разъехались бы на следующей правке.
  // Рубрики экрана «Задания» с 2026-09-22 режут список по другому шву —
  // ждут ученика или нет (splitTasksToDo.ts, ADR-0120), — и счётчику
  // колокольчика тот шов не годится: «новое» у него про то, чего человек
  // ещё не видел.
  const { data: exams, refresh: refreshExams } = useMyExams();
  const newTasks = useMemo(
    () =>
      isTeacher(me)
        ? []
        : (exams ?? []).filter((exam) => getMyExamAction(exam) === 'start'),
    [exams, me],
  );

  // Один тик обновляет оба источника: непрочитанные строки и «новое задание»
  // складываются в одну пилюлю значка, и перечитывание только ленты оставило
  // бы начатое учеником задание «новым» до перезагрузки вкладки, хотя
  // /me/exams уже вернул бы другой ответ. Опрос идёт мимо reload() —
  // публичный NotificationsData не расширяем, у reload() свои читатели
  // (markRead/markAllRead, баннер ошибки на экране).
  //
  // У штата школы запрос экзаменов выключен (MyExamsProvider.tsx, ADR-0074),
  // и будить его тиком нельзя — иначе выключенный запрос вернулся бы раз в
  // минуту. Условие здесь не дублируется: тихий refresh() сам молчит на
  // выключенном хуке (useAbortableFetch.ts), поэтому правило живёт в одном
  // месте.
  const refreshCounters = useCallback(() => {
    void refreshFeed();
    void refreshExams();
  }, [refreshFeed, refreshExams]);
  usePollWhileVisible(refreshCounters, NOTIFICATIONS_POLL_INTERVAL_MS);

  const unreadCount = page?.unreadCount ?? 0;

  return {
    items: page?.items ?? null,
    unreadCount,
    newTasks,
    count: unreadCount + newTasks.length,
    loading,
    error,
    actionError,
    reload,
    markRead,
    markAllRead,
    dismiss,
  };
}
