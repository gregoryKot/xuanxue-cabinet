// Юнит-тест joinLessonsWithClasses: дата без класса на экране ученика.
import { Types } from 'mongoose';
import { joinLessonsWithClasses } from './lesson-classes.lookup';
import type { LeanLesson } from './lesson.mapper';

const lessonDoc = {
  _id: new Types.ObjectId(),
  classId: new Types.ObjectId(),
  topic: '',
} as unknown as LeanLesson;

describe('joinLessonsWithClasses', () => {
  it('дату без класса молча пропускает (экран ученика)', () => {
    expect(joinLessonsWithClasses([lessonDoc], new Map(), () => 'dto')).toEqual([]);
  });
});
