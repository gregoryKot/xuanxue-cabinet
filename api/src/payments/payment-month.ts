// Месяц оплаты — в поясе школы, не в UTC и не в поясе того, кто нажал кнопку
// (ADR-0049): 1 сентября 00:30 по Israel в UTC ещё август, и оплата попала бы
// не в тот месяц. Только Luxon, явный пояс (CLAUDE.md «Время») — `new Date`
// и арифметика на миллисекундах здесь неприменимы в принципе.
import type { DateTime } from 'luxon';

export function monthKeyOf(now: DateTime, tz: string): string {
  return now.setZone(tz).toFormat('yyyy-LL');
}
