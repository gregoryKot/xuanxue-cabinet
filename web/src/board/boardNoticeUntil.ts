// Строка «До 20 октября» под объявлением доски (ADR-0172). `until` — дата
// без времени и без пояса ('YYYY-MM-DD', день в поясе школы, включительно):
// сдвигать её поясом зрителя нельзя, иначе в Сиднее «до 20-го» превратилось бы
// в «до 21-го». Поэтому день форматируем как полдень UTC в поясе UTC — число
// не зависит ни от пояса машины, ни от перехода часов (CLAUDE.md «Время»).
import { formatDayMonth } from '../lib/formatDate';

const NOON_UTC_SUFFIX = 'T12:00:00Z';

export function boardNoticeUntilText(until: string): string {
  return `До ${formatDayMonth(`${until}${NOON_UTC_SUFFIX}`, 'UTC')}`;
}
