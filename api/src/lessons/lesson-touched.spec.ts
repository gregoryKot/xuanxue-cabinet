// Юнит-тест «тронутости» занятия — без Mongo (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { isLessonTouched, type LessonLean } from './lesson-touched';

const iso = (value: string) => DateTime.fromISO(value, { zone: 'utc' });

const BASE_LESSON: LessonLean = {
  _id: new Types.ObjectId(),
  topic: '',
  status: 'scheduled',
  startsAt: iso('2026-03-24T17:00:00Z').toJSDate(),
  plannedAt: iso('2026-03-24T17:00:00Z').toJSDate(),
  durationMin: 90,
  recordings: [],
};

describe('isLessonTouched', () => {
  it('нетронутое сгенерированное занятие — false', () => {
    expect(isLessonTouched(BASE_LESSON)).toBe(false);
  });

  it.each<[string, Partial<LessonLean>]>([
    ['тема вписана', { topic: 'Пятое занятие цикла' }],
    ['отменено', { status: 'cancelled' }],
    [
      'перенесено (startsAt ≠ plannedAt)',
      { startsAt: iso('2026-03-24T18:00:00Z').toJSDate() },
    ],
    ['разовая ссылка', { zoomLinkOverride: 'https://zoom.example/1' }],
    ['разовый пароль', { zoomPasswordOverride: '1111' }],
    ['заметка', { note: 'предупредить о переносе' }],
    ['есть запись', { recordings: [{ title: 'Запись' }] }],
    ['назначен ведущий', { leaderId: new Types.ObjectId() }],
  ])('%s — true', (_name, patch) => {
    expect(isLessonTouched({ ...BASE_LESSON, ...patch })).toBe(true);
  });
});
