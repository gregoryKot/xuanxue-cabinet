// Ряд действий шапки раздела: вторичные кнопки-входы в подэкраны и одна
// основная. Общий для «Занятий» («Расписание» + «Разовое занятие») и
// «Рассылок» («Каналы», «Шаблоны» + «Новая рассылка») — CLAUDE.md «Одна
// механика — один компонент». Раньше вход в подэкран был карточкой внизу
// экрана, и на телефоне до неё надо было пролистать весь список; в шапку
// входы подняты по отзыву владельца 2026-09-18 и 2026-10-08
// (docs/adr/0025-navigation-by-domain.md, дополнения). Заливка терракотой на
// экране одна: основное действие — `primary`, входы — `secondary`
// (components/Button.tsx, правило акцента).
import type { CSSProperties } from 'react';
import { Button, type ButtonVariant } from './Button';

// `alignSelf: 'flex-start'` держит ряд вровень с заголовком: шапка
// выравнивает свою строку по низу (`alignItems: 'flex-end'`,
// ScreenHeader.tsx), и без него ряд уехал бы к последней строке объяснения.
// На 360px кнопки переносятся на две строки — это нормально (CLAUDE.md
// «Мобильный экран первым»).
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignSelf: 'flex-start',
};

export interface ScreenAction {
  label: string;
  onClick: () => void;
  /** По умолчанию `secondary`: основное действие экрана называют явно. */
  variant?: ButtonVariant;
}

export interface ScreenActionsProps {
  actions: ScreenAction[];
}

export function ScreenActions({ actions }: ScreenActionsProps) {
  return (
    <div style={actionsRowStyle}>
      {actions.map(({ label, onClick, variant = 'secondary' }) => (
        <Button key={label} variant={variant} onClick={onClick}>
          {label}
        </Button>
      ))}
    </div>
  );
}
