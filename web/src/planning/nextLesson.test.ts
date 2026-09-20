// `now` передаётся явно (CLAUDE.md «Детерминизм»): CI гоняет vitest под UTC
// и под TZ=Australia/Sydney, сравнение ISO-строк от системного пояса не
// зависит, но фиксированный `now` делает тест воспроизводимым в любом случае.
import { describe, expect, it } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { nextLesson } from './nextLesson';

const NOW = new Date('2026-09-08T09:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function makeLesson(id: string, startsAt: Date): LessonDto {
  return {
    id,
    classId: 'c1',
    startsAt: startsAt.toISOString(),
    durationMin: 60,
    topic: '',
    status: 'scheduled',
    recordings: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('nextLesson', () => {
  it('из нескольких будущих занятий — ближайшее по времени', () => {
    const lessons = [
      makeLesson('через сутки', new Date(NOW.getTime() + 24 * HOUR_MS)),
      makeLesson('через час', new Date(NOW.getTime() + HOUR_MS)),
    ];

    expect(nextLesson(lessons, NOW)?.id).toBe('через час');
  });

  it('прошедшие занятия не считаются', () => {
    const lessons = [makeLesson('вчера', new Date(NOW.getTime() - 24 * HOUR_MS))];

    expect(nextLesson(lessons, NOW)).toBeNull();
  });

  it('занятие ровно в `now` — уже не ближайшее, а текущее', () => {
    const lessons = [makeLesson('сейчас', NOW)];

    expect(nextLesson(lessons, NOW)).toBeNull();
  });

  it('пустой список — null, а не исключение', () => {
    expect(nextLesson([], NOW)).toBeNull();
  });
});
