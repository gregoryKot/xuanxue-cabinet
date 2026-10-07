// Что предзагрузить для роли и адреса — решение отдельно от «кто это запускает»
// (FirstScreenPrefetch.tsx), чтобы проверить его без React (CLAUDE.md, ревью
// «это можно протестировать без DOM?»).
import {
  availableNotifications,
  hasLessonScopedKinds,
  type MeDto,
} from '@xuanxue/shared';
import { MY_EXAMS_PATH, MY_LESSONS_PATH, SETTINGS_PATH } from '../api/apiPaths';
import { MY_BOARD_PATH } from '../api/boardApiPaths';
import { MY_EVENTS_PATH, SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import { GRADING_QUEUE_PATH } from '../api/gradingPaths';
import { MY_PAYMENTS_PATH } from '../api/paymentsApiPaths';
import { apiFetch } from '../api/http';
import { MY_LESSON_NOTIFICATIONS_PATH } from '../api/lessonScopePaths';
import { putPrefetched } from '../api/prefetchCache';
import { isPaymentContactVisible } from '../student/myPaymentsVisibility';
import { matchRoute } from './routeMatch';
import { ROUTE_MODULES } from './routeModules';
import { canSeeRoute, isTeacher, rootPathFor } from './screenAccess';

/**
 * GET-пути, которые стоит запросить сразу после ответа `/auth/me`,
 * параллельно с чанком экрана (routeModules.ts, `prefetch` по адресу).
 */
export function firstScreenPaths(pathname: string, me: MeDto): string[] {
  // canSeeRoute — то же правило, что решает AppShell.tsx: если человек не
  // может остаться на этом адресе, он попадёт туда же, куда его отправит
  // редирект (rootPathFor), — греем данные экрана-назначения, а не
  // запрошенного.
  const target = canSeeRoute(me, pathname) ? pathname : rootPathFor(me);
  const route = matchRoute(target);
  const paths = route?.prefetch?.(target) ?? [];
  // Прогрев повторяет то, что экран реально запросит. На «Уведомлениях» штат
  // школы за формами не пойдёт: новые задания считаются только у ученика
  // (ADR-0074), и промис, который никто не заберёт, протух бы в
  // prefetchCache. На «Заданиях» формы запрашивает любая роль (TasksScreen
  // зовёт useMyExams без опций) — там прогрев остаётся для всех.
  const skipsExams = route === ROUTE_MODULES.notifications && isTeacher(me);
  // То же с занятиями на «Настройках уведомлений» и в ленте: у человека без вида
  // про занятие нет ни блока «О каких занятиях», ни поля «За сколько
  // напомнить», ни подсказки «выберите свои занятия», и за занятиями экран не
  // пойдёт (useLessonScope.ts, ADR-0162).
  const isLessonScopeRoute =
    route === ROUTE_MODULES.notificationSettings || route === ROUTE_MODULES.notifications;
  const skipsLessonScope =
    isLessonScopeRoute && !hasLessonScopedKinds(availableNotifications(me.roles));
  // «Доска» одна на две роли (ADR-0173/0174), таблица называет запросы обеих.
  // Штат читает настройки школы (объявление с правкой) и очередь проверки —
  // экзамены, занятия, оплата и `/me/board` ученика ему не нужны; ученик (и
  // штат в режиме ученика, ADR-0163) настроек и очереди не видит, а сервер
  // ответил бы ему 403. События (ADR-0177) делятся так же: штат читает `/events`
  // (список для правки), ученик — `/me/events`, чужого сервер не отдал бы.
  // Оплата — карточка только ученика: штат в режиме
  // ученика за ней не пойдёт, сервер отказал бы (isPaymentContactVisible).
  const isBoard = route === ROUTE_MODULES.board;
  const skipsStudentBoard = isBoard && isTeacher(me);
  const skipsStaffBoard = isBoard && !isTeacher(me);
  const skipsPayments = isBoard && !isPaymentContactVisible(me);
  const skipped = new Set([
    ...(skipsExams ? [MY_EXAMS_PATH] : []),
    ...(skipsStudentBoard
      ? [MY_EXAMS_PATH, MY_LESSONS_PATH, MY_PAYMENTS_PATH, MY_BOARD_PATH, MY_EVENTS_PATH]
      : []),
    ...(skipsStaffBoard ? [SETTINGS_PATH, GRADING_QUEUE_PATH, SCHOOL_EVENTS_PATH] : []),
    ...(skipsPayments ? [MY_PAYMENTS_PATH] : []),
    ...(skipsLessonScope ? [MY_LESSON_NOTIFICATIONS_PATH] : []),
  ]);
  const needed = paths.filter((path) => !skipped.has(path));

  return [...new Set(needed)];
}

/** Мост храповика строковых `apiFetch` (scripts/string-api-fetch-bridges.mjs):
 * пути пришли строками из таблицы routeModules.ts — их собрал `apiRoutePath`
 * (или ещё не перенесённый помощник apiPaths.ts), — `apiRoute` тут не подходит:
 * ключ карты по строке не вернуть, а кэш ждёт ровно её. Кладёт промис каждого пути в prefetchCache.ts — экран заберёт его при
 * монтировании (useAbortableFetch → apiFetch → takePrefetched). */
export function prefetchFirstScreen(pathname: string, me: MeDto): void {
  for (const path of firstScreenPaths(pathname, me)) {
    putPrefetched(path, apiFetch(path));
  }
}
