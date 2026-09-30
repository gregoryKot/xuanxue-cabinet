// Против настоящей Mongo (CLAUDE.md «Тесты»): выбор «о каких занятиях»
// (ADR-0162) — read-after-write, режим «все» не стирает галочки, пачка одним
// запросом, повтор записи идемпотентен.
import type { Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { LessonScopeService } from './lesson-scope.service';
import { NotificationPrefsService } from './notification-prefs.service';

describe('LessonScopeService', () => {
  let memory: MemoryMongo;
  let model: Model<NotificationPrefsRecord>;
  let service: LessonScopeService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    service = new LessonScopeService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('без документа — обо всех занятиях, галочек нет', async () => {
    expect(await service.get('u1')).toEqual({ mode: 'all', classIds: [] });
  });

  it('документ есть, а выбора нет (человек трогал только переключатели) — обо всех', async () => {
    await new NotificationPrefsService(model).set('u1', 'exam_result', false);

    expect(await service.get('u1')).toEqual({ mode: 'all', classIds: [] });
  });

  it('выбрал занятия → прочитал: режим и список на месте (read-after-write)', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1', 'c2'] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c1', 'c2'] });
  });

  it('«выбранные» без галочек — так и читается, а не превращается в «все»', async () => {
    await service.set('u1', { mode: 'selected', classIds: [] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: [] });
  });

  it('вернулся к «всем» — галочки не стёрты, вернулся к «выбранным» — на месте', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u1', { mode: 'all', classIds: ['c1'] });

    expect(await service.get('u1')).toEqual({ mode: 'all', classIds: ['c1'] });
    const stored = await model.findOne({ userId: 'u1' }).lean();
    expect(stored?.lessonClassIds).toEqual(['c1']);
  });

  it('повторы id в списке схлопываются, порядок первых вхождений сохранён', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c2', 'c1', 'c2', 'c1'] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c2', 'c1'] });
  });

  it('второй раз то же самое — тот же результат, документ один', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
  });

  it('новый список заменяет старый целиком, а не дополняет', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1', 'c2'] });
    await service.set('u1', { mode: 'selected', classIds: ['c3'] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c3'] });
  });

  it('выбор сохраняется, переключатели уведомлений не затронуты, и наоборот', async () => {
    const prefs = new NotificationPrefsService(model);
    await prefs.set('u1', 'exam_result', false);
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await prefs.set('u1', 'payments', true);

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await prefs.get('u1', [])).toEqual({
      enabled: ['lesson_soon', 'payment_due', 'payments'],
    });
  });

  it('выбор двух людей не пересекается', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u2', { mode: 'selected', classIds: ['c2'] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await service.get('u2')).toEqual({ mode: 'selected', classIds: ['c2'] });
  });

  describe('getMany', () => {
    it('пустой список — пустая карта', async () => {
      expect(await service.getMany([])).toEqual(new Map());
    });

    it('пачка одним запросом: у каждого входного id есть запись, у людей без документа — «все»', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await new NotificationPrefsService(model).set('u2', 'exam_result', false);

      const result = await service.getMany(['u1', 'u2', 'u3']);

      expect(result).toEqual(
        new Map([
          ['u1', { mode: 'selected', classIds: ['c1'] }],
          ['u2', { mode: 'all', classIds: [] }],
          ['u3', { mode: 'all', classIds: [] }],
        ]),
      );
    });

    it('чужих людей в результате нет', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await service.set('u9', { mode: 'selected', classIds: ['c9'] });

      const result = await service.getMany(['u1']);

      expect([...result.keys()]).toEqual(['u1']);
    });
  });
});
