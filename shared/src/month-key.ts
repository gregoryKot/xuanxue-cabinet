// Ключ месяца оплаты `YYYY-MM` и его подпись по-русски (ADR-0049) — чистая
// арифметика по строке, без Luxon и без Date (CLAUDE.md «Время»). Вынесено из
// payments.ts, когда тот перерос 150 строк (храповик размера файлов): контракт
// оплат — одно, календарная строка месяца — другое, и её читают и бот, и
// кабинет ученика, и экран бухгалтера.
/** Месяц — `YYYY-MM`, без сокращений: `2026-9` и `26-09` не проходят
 * (ADR-0049 — месяц приходит с клиента строкой и проверяется DTO, не
 * собирается из чисел). */
export const MONTH_KEY_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}
const MONTH_NAMES_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

/** '2026-09' → 'сентябрь 2026' — для бота, принимающего скриншот (ADR-0050,
 * payment-screenshot-deep-link.ts/payment-screenshot-message.handler.ts), для
 * экрана «Оплаты» и напоминания бота (docs/PLAN.md §15, ADR-0051 «{месяц}»,
 * следующий PR). Вход — уже проверенный `MONTH_KEY_RE` месяц (DTO или
 * `monthKeyOf`), повторной проверки здесь нет. */
export function formatMonthRu(month: string): string {
  return `${formatMonthNameRu(month)} ${month.slice(0, 4)}`;
}

/** '2026-09' → 'сентябрь' — месяц без года, для строки кабинета ученика
 * «Оплаты за сентябрь нет» (PLAN §15, слой 2.4): год там стоит в названии
 * строки рядом, второй раз он лишний. */
export function formatMonthNameRu(month: string): string {
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return MONTH_NAMES_RU[monthIndex] ?? month;
}

/** '2026-01' + (-1) → '2025-12' — чистая арифметика по строке, без Date
 * (CLAUDE.md «Время»): считает окно допустимых месяцев скриншота
 * (payment-screenshot-month-window.ts, ADR-0050) и пригодится кнопкам
 * «следующий/предыдущий месяц» на экране «Оплаты» (следующий PR). */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex0 = Number(month.slice(5, 7)) - 1 + delta;
  const shiftedYear = year + Math.floor(monthIndex0 / 12);
  const shiftedMonthIndex0 = ((monthIndex0 % 12) + 12) % 12;
  return `${shiftedYear}-${String(shiftedMonthIndex0 + 1).padStart(2, '0')}`;
}
