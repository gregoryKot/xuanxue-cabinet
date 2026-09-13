// Пункты навигации — по одному на домен (отзыв владельца 2026-09-12: «меню
// всё ещё сложное. Должно быть супер просто. Всё, что касается рассылок — в
// одно, экзаменов — в другое, учеников — в третье»). Вход в подэкран раздела
// (расписание, каналы, шаблоны, вопросы) — карточкой на самом экране раздела
// (components/SectionLink.tsx), не отдельным пунктом меню. Новый экран
// заводится внутри своего раздела, а не пятым пунктом сюда
// (docs/adr/0025-navigation-by-domain.md).
import type { ComponentType } from 'react';
import { BroadcastsIcon, ExamsIcon, PeopleIcon, PlanningIcon } from './navIcons';

export interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType;
  /** Только для админа (GET /users под `@Roles('admin')`, не трогаем). */
  adminOnly?: boolean;
  /** Дочерние маршруты раздела — по ним `activeSectionPath` подсвечивает
   * пункт меню, когда открыт не сам раздел, а его подэкран. */
  childPaths: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/planning', label: 'Занятия', Icon: PlanningIcon, childPaths: ['/schedule'] },
  {
    to: '/broadcasts',
    label: 'Рассылки',
    Icon: BroadcastsIcon,
    childPaths: ['/channels', '/templates'],
  },
  {
    to: '/exams',
    label: 'Экзамены',
    Icon: ExamsIcon,
    childPaths: ['/exam-items', '/grading'],
  },
  { to: '/people', label: 'Ученики', Icon: PeopleIcon, adminOnly: true, childPaths: [] },
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
