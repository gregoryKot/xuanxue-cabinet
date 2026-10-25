// Таблица экранов ученика — часть ROUTE_MODULES (routeModules.ts), вынесена
// отдельным файлом: в самой таблице уже за четыреста строк, а храповик размера
// (check-file-size-ratchet) не даёт ей расти. Ключи и поля те же; в
// ROUTE_MODULES блок попадает спредом, `matchRoute` и `<Route>` разницы не видят.
//
// Все экраны открыты любой роли (screenAccess.ts, canSeeRoute), как «/profile»
// в routeModules.ts.
import {
  MY_EXAMS_PATH,
  MY_LESSONS_ARCHIVE_PATH,
  MY_LESSONS_PATH,
  MY_MATERIALS_PATH,
  SETTINGS_PATH,
} from '../api/apiPaths';
import { MY_BOARD_PATH } from '../api/boardApiPaths';
import { MY_EVENTS_PATH, SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import { GRADING_QUEUE_PATH } from '../api/gradingPaths';
import { MY_PAYMENTS_PATH } from '../api/paymentsApiPaths';
import type { RouteModule } from './routeModules';

export const STUDENT_ROUTE_MODULES = {
  // «Доска» — первый экран при любом входе: у ученика (ADR-0173) объявление
  // (`/me/board`), экзамены к сдаче, оплата за месяц и ближайшее занятие; у
  // штата (ADR-0174) настройки школы (объявление с правкой, ADR-0172 доп.) и
  // очередь проверки, остальное — карточки-входы без данных. Таблица от роли
  // не зависит и называет запросы обеих досок; кому что греть, решает
  // prefetchFirstScreen.ts: штату — без запросов ученика, ученику — без
  // настроек, очереди и списка событий штата (сервер ответил бы 403), оплату —
  // только тому, кому видна карточка (isPaymentContactVisible). События
  // (ADR-0177): ученик читает `/me/events`, штат — `/events`.
  board: {
    path: '/board',
    load: () => import('../board/BoardScreen'),
    warm: true,
    prefetch: () => [
      MY_EXAMS_PATH,
      MY_LESSONS_PATH,
      MY_PAYMENTS_PATH,
      MY_BOARD_PATH,
      SETTINGS_PATH,
      GRADING_QUEUE_PATH,
      MY_EVENTS_PATH,
      SCHOOL_EVENTS_PATH,
    ],
  },
  // «Задания» и «Занятия» ученика (решение владельца: экзамены — отдельный
  // экран, docs/PLAN.md §11).
  tasks: {
    path: '/tasks',
    load: () => import('../student/TasksScreen'),
    warm: true,
    prefetch: () => [MY_EXAMS_PATH],
  },
  studentLessons: {
    path: '/lessons',
    load: () => import('../student/LessonsScreen'),
    warm: true,
    prefetch: () => [MY_LESSONS_PATH],
  },
  // «Записи занятий» (слой 3.3, docs/PLAN.md §14) — подэкран «Занятий», вход
  // карточкой SectionLink на LessonsScreen.tsx, не пункт меню (ADR-0025), тот
  // же приём, что у «Библиотеки» ученика (library ниже).
  archive: {
    path: '/archive',
    load: () => import('../student/ArchiveScreen'),
    warm: true,
    prefetch: () => [MY_LESSONS_ARCHIVE_PATH],
  },
  // «Библиотека» ученика (слой 3.2, docs/PLAN.md §14) — подэкран «Занятий»,
  // вход карточкой SectionLink на LessonsScreen.tsx, не пункт меню
  // (ADR-0025), тот же приём, что у «Записей занятий» (archive) выше.
  library: {
    path: '/library',
    load: () => import('../student/LibraryScreen'),
    warm: true,
    prefetch: () => [MY_MATERIALS_PATH],
  },
} satisfies Record<string, RouteModule>;
