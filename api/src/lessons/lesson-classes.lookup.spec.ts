// Юнит-тест joinLessonsWithClasses: режим «нет класса» (ADR-0170).
import { Types } from 'mongoose';
import { joinLessonsWithClasses } from './lesson-classes.lookup';
import type { LeanLesson } from './lesson.mapper';

const lessonDoc = {
  _id: new Types.ObjectId(),
  classId: new Types.ObjectId(),
  topic: '',
} as unknown as LeanLesson;

describe('joinLessonsWithClasses', () => {
  it('по умолчанию дату без класса молча пропускает (экран ученика)', () => {
    expect(joinLessonsWithClasses([lessonDoc], new Map(), () => 'dto')).toEqual([]);
  });

  it('missingClass: fail — бросает, называя занятие и класс', () => {
    expect(() =>
      joinLessonsWithClasses([lessonDoc], new Map(), () => 'dto', {
        missingClass: 'fail',
      }),
    ).toThrow(
      `Занятие ${lessonDoc._id.toString()} ссылается на несуществующий класс ${lessonDoc.classId.toString()}`,
    );
  });
});
