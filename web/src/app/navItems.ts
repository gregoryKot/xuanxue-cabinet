// Пункты нижней навигации — один список, экран добавляет свою строку в том
// патче, где появляется (CLAUDE.md «Мобильный экран первым»). Больше 5
// пунктов на 360px — иконка + короткая подпись вместо «Ещё» (см. AppShell.tsx,
// ревью п.11): решение принято в этом PR заранее, чтобы следующие экраны
// («Рассылки», «Шаблоны») просто дописали строку сюда и иконку в navIcons.tsx.
import type { ComponentType } from 'react';
import { ChannelsIcon, PlanningIcon, ScheduleIcon, SummaryIcon } from './navIcons';

export interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/summary', label: 'Сводка', Icon: SummaryIcon },
  { to: '/schedule', label: 'Расписание', Icon: ScheduleIcon },
  { to: '/planning', label: 'Планирование', Icon: PlanningIcon },
  { to: '/channels', label: 'Каналы', Icon: ChannelsIcon },
];
