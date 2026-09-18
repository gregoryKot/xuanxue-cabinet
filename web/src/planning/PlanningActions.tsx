// Действия шапки «Занятий»: переход в сетку расписания и «Разовое занятие»
// в один ряд. Раньше вход в расписание был карточкой внизу экрана
// (docs/adr/0025-navigation-by-domain.md), в шапку его подняли по отзыву
// владельца 2026-09-18 — карточку внизу списка на телефоне было не найти, до
// неё приходилось пролистать все занятия на четыре недели. В шапке кнопка не
// сдвигает вниз блок «сегодня» (PlanningToday.tsx), ради которого этот экран
// и открывают чаще всего. Силуэт «Расписания» — вторичный: киноварь на
// экране одна, и она уже занята «Разовым занятием» (components/Button.tsx,
// правило акцента).
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';

// `alignSelf: 'flex-start'` раньше давал `primaryActionStyle` одиночной
// кнопке (screenLayout.ts): шапка выравнивает свою строку по низу
// (`alignItems: 'flex-end'`, ScreenHeader.tsx), и без этой строки пара
// действий уехала бы вниз, к последней строке объяснения, а не встала бы
// вровень с заголовком. На 360px кнопки переносятся на две строки — это
// нормально (CLAUDE.md «Мобильный экран первым»).
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignSelf: 'flex-start',
};

export interface PlanningActionsProps {
  onOpenSchedule: () => void;
  onCreateOneOff: () => void;
}

export function PlanningActions({
  onOpenSchedule,
  onCreateOneOff,
}: PlanningActionsProps) {
  return (
    <div style={actionsRowStyle}>
      <Button variant="secondary" onClick={onOpenSchedule}>
        Расписание
      </Button>
      <Button onClick={onCreateOneOff}>Разовое занятие</Button>
    </div>
  );
}
