// Ближайшие события для доски штата (ADR-0177). GET /events отдаёт штату всё
// подряд, от поздних к ранним, включая прошедшие (чтобы их можно было
// найти и поправить), а на доске нужны только предстоящие и идущие — тот же
// критерий, что у GET /me/events на сервере: `endsAt ?? startsAt` не в
// прошлом. Многодневный ретрит остаётся на доске до своего последнего дня.
import type { SchoolEventDto } from '@xuanxue/shared';

// Date.parse, не `new Date(строка)`: конструктор с аргументом в бизнес-логике
// запрещён eslint (CLAUDE.md «Время»), а разобрать ISO UTC с Z надо ровно раз.
function lastMomentMs(event: SchoolEventDto): number {
  return Date.parse(event.endsAt ?? event.startsAt);
}

/** Предстоящие и идущие, ближайшее сверху. Исходный список не меняет. */
export function upcomingEvents(events: SchoolEventDto[], now: Date): SchoolEventDto[] {
  const nowMs = now.getTime();
  return events
    .filter((event) => lastMomentMs(event) >= nowMs)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
