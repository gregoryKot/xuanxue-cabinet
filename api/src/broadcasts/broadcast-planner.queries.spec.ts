// Против настоящей Mongo (CLAUDE.md «Тесты»): предел выборки — часть
// запроса Mongo (`.limit()`), не пост-фильтр в JS. Остальное поведение
// findClasses (расшифровка полей) покрыто через BroadcastPlannerService в
// broadcast-planner.service.spec.ts; здесь — только предел «дай всё»
// запрещено (CLAUDE.md «API»).
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { findClasses } from './broadcast-planner.queries';

describe('findClasses', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await classModel.deleteMany({});
  });

  it(`классов на 1 больше лимита — выборка не превышает LIST_LIMIT_MAX (${LIST_LIMIT_MAX})`, async () => {
    const docs = Array.from({ length: LIST_LIMIT_MAX + 1 }, (_, i) => ({
      title: `класс ${i}`,
      format: 'online' as const,
      active: true,
    }));
    await classModel.insertMany(docs);

    const classes = await findClasses(classModel);

    expect(classes).toHaveLength(LIST_LIMIT_MAX);
  });
});
