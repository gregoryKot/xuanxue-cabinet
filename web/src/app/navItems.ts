// Пункты нижней навигации — один список, экран добавляет свою строку в том
// патче, где появляется (CLAUDE.md «Мобильный экран первым»). 6 пунктов на
// 360px не умещаются подписью в строку — иконка сверху и короткая подпись
// вместо «Ещё» (см. AppShell.tsx, pr-k3-fixes.md п.10): решение принято в
// PR K2 заранее, «Рассылки»/«Шаблоны» просто дописали строку сюда и иконку
// в navIcons.tsx. Подписи — короткие ключевые слова, не полные названия
// экрана (у «Расписания» и «Планирования» есть свой заголовок на самом
// экране, здесь важно уместиться в строку).
import type { ComponentType } from 'react';
import {
  BroadcastsIcon,
  ChannelsIcon,
  PlanningIcon,
  ScheduleIcon,
  SummaryIcon,
  TemplatesIcon,
} from './navIcons';

export interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/summary', label: 'Сводка', Icon: SummaryIcon },
  { to: '/schedule', label: 'Занятия', Icon: ScheduleIcon },
  { to: '/planning', label: 'План', Icon: PlanningIcon },
  { to: '/channels', label: 'Каналы', Icon: ChannelsIcon },
  { to: '/broadcasts', label: 'Рассылки', Icon: BroadcastsIcon },
  { to: '/templates', label: 'Шаблоны', Icon: TemplatesIcon },
];
