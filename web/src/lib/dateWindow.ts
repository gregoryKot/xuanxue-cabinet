// Точная арифметика недельных окон в UTC — общий helper для «Планирования»,
// «Рассылок» и предпросмотра шаблонов (pr-k3-fixes.md п.1): `setDate(date.getDate()
// + N*7)` держит местную стену часов, и на переходе летнего/зимнего времени
// (Asia/Jerusalem, 2026-10-25 и 2026-03-27) разница `to − from` в UTC съезжает
// на ±1 час — сервер (`assertWindow` в UTC, `api/src/common/date-window.ts`)
// отвечает 400. `shiftByWeeks` считает через `getTime()`, без обращения к
// местному времени вообще.
export const MS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

/** `weeks` может быть отрицательным — сдвиг назад (начало окна журнала
 * рассылок, broadcasts/broadcastWindow.ts). */
export function shiftByWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * MS_IN_WEEK);
}
