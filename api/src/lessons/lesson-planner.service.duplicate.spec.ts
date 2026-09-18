// Фейк модели вместо настоящей Mongo — воспроизводит гонку двух тиков на
// insertMany(ordered:false), которую честно проверяет и интеграционный тест
// (lesson-planner.service.spec.ts, «два параллельных plan»), но здесь без
// таймингов реальной базы: код E11000 без `writeErrors` — форма, которую
// драйвер отдаёт при единственной упавшей вставке.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from './lesson.schema';
import { LessonPlannerService } from './lesson-planner.service';

// Гонка на insertMany падает раньше moveLesson (toMove здесь всегда пуст) —
// LessonLinkRebuildService.rebuild не зовётся вовсе, фейк нужен только чтобы
// собрать конструктор.
const NOOP_LESSON_LINK_REBUILD = {
  rebuild: () => Promise.resolve(false),
} as unknown as LessonLinkRebuildService;

const NOW = DateTime.fromISO('2026-03-20T00:00:00Z', { zone: 'utc' });

// Любой не-дубль — 121 (DocumentValidationFailure) взят как пример реальной
// ошибки записи Mongo, отличной от E11000.
const NON_DUPLICATE_ERROR_CODE = 121;

const CLASS_ID = new Types.ObjectId();
const RULE = {
  _id: new Types.ObjectId(),
  weekday: 2 as const,
  time: '19:00',
  durationMin: 90,
};
const ONE_ACTIVE_CLASS = [
  { _id: CLASS_ID, active: true, tz: 'Asia/Jerusalem', leadMinutes: 30, rules: [RULE] },
];

function fakeModels(insertMany: () => Promise<unknown>) {
  const classModel = { find: () => ({ lean: () => Promise.resolve(ONE_ACTIVE_CLASS) }) };
  const lessonModel = {
    find: () => ({ lean: () => Promise.resolve([]) }),
    distinct: () => Promise.resolve([]),
    insertMany,
  };
  return {
    classModel: classModel as unknown as Model<ClassRecord>,
    lessonModel: lessonModel as unknown as Model<LessonRecord>,
  };
}

describe('LessonPlannerService.plan — гонка insertMany на дубликате', () => {
  it('E11000 без writeErrors (одна упавшая вставка) — не бросает, created=0', async () => {
    const { classModel, lessonModel } = fakeModels(() =>
      Promise.reject(
        Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
      ),
    );
    const service = new LessonPlannerService(
      classModel,
      lessonModel,
      NOOP_LESSON_LINK_REBUILD,
    );

    const result = await service.plan(NOW);

    expect(result).toEqual({ created: 0, removed: 0 });
  });

  it('другая ошибка insertMany не считается дублем — класс логирует, plan() не падает', async () => {
    const { classModel, lessonModel } = fakeModels(() =>
      Promise.reject(
        Object.assign(new Error('validation failed'), { code: NON_DUPLICATE_ERROR_CODE }),
      ),
    );
    const service = new LessonPlannerService(
      classModel,
      lessonModel,
      NOOP_LESSON_LINK_REBUILD,
    );

    // Не-дубль уходит наверх из insertMissing; per-класс try/catch в plan()
    // ловит её и логирует — вызывающий код не падает.
    const result = await service.plan(NOW);

    expect(result).toEqual({ created: 0, removed: 0 });
  });
});
