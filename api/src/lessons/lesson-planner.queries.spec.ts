// Фейк модели вместо настоящей Mongo — юнит-тест ветки catch в moveLesson
// (перенос, столкнувшийся с занятым местом): реальную гонку двух
// пересекающихся тиков честно проверяет lesson-planner.service.spec.ts («два
// параллельных plan»), а последовательную коллизию соседних правил —
// «коллизия переносов» там же (сходится за счёт reconcileClass и до
// updateOne не доходит вовсе). Здесь — сам catch, без сборки такой гонки.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { LessonRecord } from './lesson.schema';
import { moveLesson } from './lesson-planner.queries';

// Любой не-дубль — 121 (DocumentValidationFailure) взят как пример реальной
// ошибки записи Mongo, отличной от E11000.
const NON_DUPLICATE_ERROR_CODE = 121;

const MOVE = {
  id: new Types.ObjectId(),
  plannedAt: DateTime.fromISO('2026-03-24T18:00:00Z', { zone: 'utc' }),
  durationMin: 90,
};

function fakeLessonModel(updateOne: () => Promise<unknown>): Model<LessonRecord> {
  return { updateOne } as unknown as Model<LessonRecord>;
}

describe('moveLesson', () => {
  it('E11000 на updateOne — не бросает, возвращает false («не в этот раз»)', async () => {
    const model = fakeLessonModel(() =>
      Promise.reject(Object.assign(new Error('E11000'), { code: 11000 })),
    );
    await expect(moveLesson(model, MOVE)).resolves.toBe(false);
  });

  it('другая ошибка updateOne не считается коллизией — уходит наверх', async () => {
    const model = fakeLessonModel(() =>
      Promise.reject(
        Object.assign(new Error('validation failed'), { code: NON_DUPLICATE_ERROR_CODE }),
      ),
    );
    await expect(moveLesson(model, MOVE)).rejects.toThrow('validation failed');
  });

  it('успешный updateOne — true', async () => {
    const model = fakeLessonModel(() => Promise.resolve({ acknowledged: true }));
    await expect(moveLesson(model, MOVE)).resolves.toBe(true);
  });
});
