// Пункты навигации — по одному на домен (отзыв владельца 2026-09-12: «меню
// всё ещё сложное. Должно быть супер просто. Всё, что касается рассылок — в
// одно, экзаменов — в другое, учеников — в третье»). Вход в подэкран раздела
// (расписание, каналы, шаблоны, вопросы) — карточкой на самом экране раздела
// (components/SectionLink.tsx), не отдельным пунктом меню. Новый экран
// заводится внутри своего раздела, а не отдельным пунктом сюда
// (docs/adr/0025-navigation-by-domain.md) — с одним названным исключением,
// ADR-0055 («Материалы»): потолок всё равно пять пунктов, шестой домен сюда
// не добавляется.
//
// Два списка, не один с фильтром по роли: у ученика роль — это ОТСУТСТВИЕ
// teacher/assistant/admin (screenAccess.ts), а `NavItem.roles` умеет только
// показать пункт при роли, не исключить всех, у кого её нет. Решение
// владельца: у ученика два своих экрана — «Задания» первым, «Занятия»
// вторым, — не подмножество меню штата.
//
// Первый пункт списка штата — первый экран после входа, та же механика, что
// у ученика. Владелец 2026-10-06: «доска стала главным экраном при любом
// входе. у учителя там кнопки настроить расписание, рассылки, материалы — из
// навигации можно убрать» — «Доска» первым пунктом STAFF_NAV_ITEMS, а
// «Занятия», «Рассылки» и «Материалы» ушли из панели в карточки-входы на
// самой доске (ADR-0174, заменяет ADR-0138; BOARD_PATH в screenAccess.ts).
// Три пункта у штата, предел ADR-0055 (пять) не нарушен.
//
// «Главная» (ADR-0178, раньше «Доска»): адрес `/board` и `BOARD_PATH` остались,
// ссылки и закладки целы. «Задания» у ученика — только при наличии экзаменов.
import type { MeDto, UserRole } from '@xuanxue/shared';
import { PAYMENTS_SCREEN_PATH } from '../payments/paymentsPath';
import { BOARD_PATH, isAccountant, isTeacher } from './screenAccess';

const TASKS_PATH = '/tasks';

// Разделы, которые открываются с главной, а не из панели (ADR-0174): пока
// учитель в расписании, рассылках или материалах, подсвечена «Главная» — он
// пришёл туда с неё и вернётся на неё. Без этого на `/planning` не горел бы
// ни один пункт, как на `/login`. Подэкраны разделов — тот же приём, что был
// у них в `childPaths` своих пунктов: `/schedule` под «Занятиями», `/channels`
// и `/templates` под «Рассылками», `/materials/tags` под «Материалами»
// (ADR-0075). `/x/new` и `/x/:id` не подсвечивают ничего — как и раньше
// (`activeSectionPath` сравнивает путь целиком).
const BOARD_LABEL = 'Главная';

const BOARD_CHILD_PATHS = [
  '/planning',
  '/schedule',
  '/broadcasts',
  '/channels',
  '/templates',
  '/materials',
  '/materials/tags',
  // Экран «Школа» (ADR-0176) — тоже вход с главной.
  '/school',
];

/** Имя значка нижней панели телефона (NavIcon.tsx, ADR-0097). Union строк,
 * не `enum` (CLAUDE.md «TypeScript строгий»). */
export type NavIconName =
  | 'lessons'
  | 'broadcasts'
  | 'exams'
  | 'people'
  | 'materials'
  | 'tasks'
  | 'payments'
  | 'board';

export interface NavItem {
  to: string;
  label: string;
  /** Пункт виден только с одной из перечисленных ролей; без поля — виден
   * всем. `/people` — admin и teacher (RequirePeopleAccess, ADR-0030). */
  roles?: UserRole[];
  /** Дочерние маршруты раздела — по ним `activeSectionPath` подсвечивает
   * пункт меню, когда открыт не сам раздел, а его подэкран. */
  childPaths: string[];
  /** Имя значка нижней панели телефона, не готовый узел: `navItems.ts`
   * остаётся модулем без JSX, рисует значок NavIcon.tsx (ADR-0097). Боковая
   * колонка на мониторе значок не берёт — там подпись остаётся словом. */
  icon: NavIconName;
}

export const STAFF_NAV_ITEMS: NavItem[] = [
  { to: BOARD_PATH, label: BOARD_LABEL, childPaths: BOARD_CHILD_PATHS, icon: 'board' },
  {
    to: '/exams',
    label: 'Экзамены',
    childPaths: ['/exam-items', '/grading'],
    icon: 'exams',
  },
  {
    to: '/people',
    label: 'Ученики',
    roles: ['admin', 'teacher'],
    // «Оплаты» — подэкран «Учеников» для админа (ADR-0171); для учителя
    // маршрут закрыт гвардом, подсвечивать ему нечего.
    childPaths: [PAYMENTS_SCREEN_PATH],
    icon: 'people',
  },
];

/** Решение владельца 2026-10-06 (ADR-0173): первый экран после входа, «Задания»
 * и «Занятия» — следом; три пункта, предел ADR-0055 (пять) не нарушен.
 * «Задания» убирает navItemsFor, когда экзаменов нет (ADR-0178). */
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { to: BOARD_PATH, label: BOARD_LABEL, childPaths: [], icon: 'board' },
  { to: TASKS_PATH, label: 'Задания', childPaths: [], icon: 'tasks' },
  // «/archive» («Записи занятий», слой 3.3) и «/library» («Библиотека»,
  // слой 3.2) — подэкраны «Занятий», вход карточкой SectionLink на
  // LessonsScreen.tsx (ADR-0025): вкладка «Занятия» остаётся подсвеченной,
  // когда ученик уже открыл один из них.
  {
    to: '/lessons',
    label: 'Занятия',
    childPaths: ['/archive', '/library'],
    icon: 'lessons',
  },
];

/** Панель бухгалтера — один пункт (ADR-0171). */
export const ACCOUNTANT_NAV_ITEMS: NavItem[] = [
  { to: PAYMENTS_SCREEN_PATH, label: 'Оплаты', childPaths: [], icon: 'payments' },
];

export interface NavContext {
  /** Есть ли у ученика хоть один экзамен в `GET /me/exams`. Пока список
   * грузится или не загрузился, `false`: пункт не мигает у тех, кто не учится
   * на курсе. Маршрут `/tasks` от этого не закрывается — глубокие ссылки из
   * уведомлений работают (ADR-0129). Штата и бухгалтера признак не касается. */
  hasExams: boolean;
}

/** Пункты навигации для роли этого человека (AppNav.tsx). */
export function navItemsFor(me: MeDto | null, { hasExams }: NavContext): NavItem[] {
  if (isTeacher(me)) return STAFF_NAV_ITEMS;
  if (isAccountant(me)) return ACCOUNTANT_NAV_ITEMS;
  return hasExams
    ? STUDENT_NAV_ITEMS
    : STUDENT_NAV_ITEMS.filter((item) => item.to !== TASKS_PATH);
}

/** Какой пункт меню подсветить для текущего пути — сам раздел или один из
 * его подэкранов (`childPaths`). `null` — путь ни в одном разделе (например,
 * `/login`). */
export function activeSectionPath(pathname: string, items: NavItem[]): string | null {
  const item = items.find(
    (candidate) => candidate.to === pathname || candidate.childPaths.includes(pathname),
  );
  return item?.to ?? null;
}
