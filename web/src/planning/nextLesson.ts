// Ближайшее занятие после `now` — из уже загруженного списка `/lessons`
// (CLAUDE.md «Тесты»: чистая логика — юнит без React). Блок «Сегодня»
// показывает его, когда сегодня пусто. Не ходим в `/summary` ради одного
// поля: `SummaryDto.nextLesson` остаётся в API — им пользуется бот
// (docs/adr/0025-navigation-by-domain.md).
import type { LessonDto } from '@xuanxue/shared';

/** `now` — параметр ради теста (CLAUDE.md «Детерминизм»). */
export function nextLesson(
  lessons: LessonDto[],
  now: Date = new Date(),
): LessonDto | null {
  const nowIso = now.toISOString();
  const upcoming = lessons
    .filter((lesson) => lesson.startsAt > nowIso)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return upcoming[0] ?? null;
}
