// Пилюля-счётчик у значка уведомлений (ADR-0063). Значок один на обе ширины
// экрана (NotificationBell.tsx), но пилюля вынесена отдельно: её же рисует
// сам центр уведомлений, а раздельные копии одного числа — дубль, который
// поймал бы jscpd (CLAUDE.md «Одна механика — один компонент»).
//
// (1) Заливка тушью (--ink), не терракотой: правило «одна терракота на
// экран» — она занята главным действием экрана. Заливка --ink — свой приём
// проекта для активной пилюли фильтра (components/ListFilters.tsx,
// toggleActiveStyle), --ink-contrast поверх неё даёт 13.68:1.
// (2) `aria-hidden` — число уже звучит словами в aria-label ссылки
// (badgeLabel, notificationBadge.ts), иначе скринридер прочитал бы счётчик
// дважды.
// (3) `aria-live` здесь намеренно не стоит. Лента перечитывается сама — и
// сейчас после отметки «прочитано», и тем более когда появится фоновый
// опрос, — а живая область зачитывала бы счётчик вслух при каждом таком
// обновлении, а не когда человек сам заглянул на значок.
import type { CSSProperties } from 'react';
import { badgeText } from './notificationBadge';

const pillStyle: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--ink-contrast)',
  borderRadius: 'var(--radius-pill)',
  fontSize: 11,
  lineHeight: 1,
  padding: '3px 6px',
  minWidth: 18,
  textAlign: 'center',
  fontWeight: 500,
};

interface NotificationCountProps {
  count: number;
}

export function NotificationCount({ count }: NotificationCountProps) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" style={pillStyle}>
      {badgeText(count)}
    </span>
  );
}
