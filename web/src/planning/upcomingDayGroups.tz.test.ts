// «Сегодня» у отбора считается по часам зрителя, и чужой пояс — не деталь
// оформления: в UTC+14 занятие вчерашнего по Гринвичу вечера идёт сегодня.
// Отдельный файл, а не блок в upcomingDayGroups.test.ts: `process.env.TZ`
// глобален для процесса, стаб должен жить и сниматься в своём модуле
// (образец — planningWindow.tz.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { upcomingDayGroups } from './upcomingDayGroups';

// UTC+14 круглый год — календарный день зрителя почти всегда обгоняет UTC.
stubViewerTimeZone('Pacific/Kiritimati');

function idsLeftAfterPick(lessons: LessonDto[], now: Date): string[] {
  return upcomingDayGroups(lessons, now).flatMap((group) =>
    group.lessons.map((lesson) => lesson.id),
  );
}

describe('upcomingDayGroups — день зрителя, а не день UTC', () => {
  it('Pacific/Kiritimati: одни сутки по UTC — вчера и сегодня по часам зрителя', () => {
    // 2026-09-21T12:00Z — у зрителя уже 22 сентября, 02:00. Оба занятия
    // приходятся на 21 сентября по UTC: по UTC они оба «сегодня», и тест
    // краснеет, если пояс зрителя потерялся.
    const left = idsLeftAfterPick(
      [
        // 21 сентября, 23:00 у зрителя — вчерашний день.
        makeLesson({ id: 'вчера', startsAt: '2026-09-21T09:00:00.000Z' }),
        // 22 сентября, 01:00 у зрителя — сегодняшний.
        makeLesson({ id: 'сегодня', startsAt: '2026-09-21T11:00:00.000Z' }),
      ],
      new Date('2026-09-21T12:00:00.000Z'),
    );

    expect(left).toEqual(['сегодня']);
  });

  describe('переход зимнего времени Asia/Jerusalem', () => {
    // Стрелки переводят 2026-10-25 в 02:00 (UTC+3 → UTC+2) — граница
    // календарного дня в эту ночь лежит не там, где накануне. Поверх пояса
    // файла: общий `afterEach` из stubViewerTimeZone снимает оба стаба.
    beforeEach(() => {
      vi.stubEnv('TZ', 'Asia/Jerusalem');
    });

    it('занятие ночи перевода остаётся, вечер накануне отброшен', () => {
      // 2026-10-25T08:00Z — у зрителя 10:00, стрелки уже перевели.
      const left = idsLeftAfterPick(
        [
          // 24 октября, 23:00 по Израилю (ещё UTC+3) — вчерашний день.
          makeLesson({ id: 'вчера', startsAt: '2026-10-24T20:00:00.000Z' }),
          // 25 октября, 01:30 по Израилю (ещё UTC+3) — сегодняшний.
          makeLesson({ id: 'ночью', startsAt: '2026-10-24T22:30:00.000Z' }),
          // 25 октября, 02:30 по Израилю (уже UTC+2) — сегодняшний.
          makeLesson({ id: 'после перевода', startsAt: '2026-10-25T00:30:00.000Z' }),
        ],
        new Date('2026-10-25T08:00:00.000Z'),
      );

      expect(left).toEqual(['ночью', 'после перевода']);
    });
  });
});
