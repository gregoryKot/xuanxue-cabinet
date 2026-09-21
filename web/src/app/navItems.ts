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
import type { MeDto, UserRole } from '@xuanxue/shared';
import { isTeacher } from './screenAccess';

/** Имя значка нижней панели телефона (NavIcon.tsx, ADR-0097). Union строк,
 * не `enum` (CLAUDE.md «TypeScript строгий»). */
export type NavIconName =
  'lessons' | 'broadcasts' | 'exams' | 'people' | 'materials' | 'tasks';

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
  { to: '/planning', label: 'Занятия', childPaths: ['/schedule'], icon: 'lessons' },
  {
    to: '/broadcasts',
    label: 'Рассылки',
    childPaths: ['/channels', '/templates'],
    icon: 'broadcasts',
  },
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
    childPaths: [],
    icon: 'people',
  },
  // Пятый пункт, добавленный ADR-0055 — единственное названное исключение
  // из правила выше. `/materials/new` и `/materials/:materialId`
  // подсвечивать пункт не должны отдельной записью (и без того не
  // подсвечивают, `activeSectionPath` сравнивает путь целиком) — а
  // `/materials/tags` (ADR-0075) в childPaths: это подэкран «Материалов»,
  // тот же приём, что у «/archive»/«/library» под «Занятиями» ученика.
  {
    to: '/materials',
    label: 'Материалы',
    childPaths: ['/materials/tags'],
    icon: 'materials',
  },
];

/** Решение владельца: экзамены — отдельный экран и первый после входа,
 * занятия — второй (docs/PLAN.md §11). */
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { to: '/tasks', label: 'Задания', childPaths: [], icon: 'tasks' },
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

/** Пункты навигации для роли этого человека (AppNav.tsx). */
export function navItemsFor(me: MeDto | null): NavItem[] {
  return isTeacher(me) ? STAFF_NAV_ITEMS : STUDENT_NAV_ITEMS;
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
