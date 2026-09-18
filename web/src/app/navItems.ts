// Пункты навигации — по одному на домен (отзыв владельца 2026-09-12: «меню
// всё ещё сложное. Должно быть супер просто. Всё, что касается рассылок — в
// одно, экзаменов — в другое, учеников — в третье»). Вход в подэкран раздела
// (расписание, каналы, шаблоны, вопросы) — карточкой на самом экране раздела
// (components/SectionLink.tsx), не отдельным пунктом меню. Новый экран
// заводится внутри своего раздела, а не пятым пунктом сюда
// (docs/adr/0025-navigation-by-domain.md).
import type { UserRole } from '@xuanxue/shared';

export interface NavItem {
  to: string;
  label: string;
  /** Пункт виден только с одной из перечисленных ролей; без поля — виден
   * всем. `/people` — admin и teacher (RequirePeopleAccess, ADR-0030). */
  roles?: UserRole[];
  /** Дочерние маршруты раздела — по ним `activeSectionPath` подсвечивает
   * пункт меню, когда открыт не сам раздел, а его подэкран. */
  childPaths: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/planning', label: 'Занятия', childPaths: ['/schedule'] },
  {
    to: '/broadcasts',
    label: 'Рассылки',
    childPaths: ['/channels', '/templates'],
  },
  {
    to: '/exams',
    label: 'Экзамены',
    childPaths: ['/exam-items', '/grading'],
  },
  {
    to: '/people',
    label: 'Ученики',
    roles: ['admin', 'teacher'],
    childPaths: [],
  },
];

/** Какой пункт меню подсветить для текущего пути — сам раздел или один из
 * его подэкранов (`childPaths`). `null` — путь ни в одном разделе (например,
 * `/login`). */
export function activeSectionPath(pathname: string): string | null {
  const item = NAV_ITEMS.find(
    (candidate) => candidate.to === pathname || candidate.childPaths.includes(pathname),
  );
  return item?.to ?? null;
}
