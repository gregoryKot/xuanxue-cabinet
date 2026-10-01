// Против настоящей Mongo (CLAUDE.md «Тесты»): выбор «о каких занятиях» и «за
// сколько минут» (ADR-0162) — read-after-write, режим «все» не стирает галочки,
// пачка одним запросом, повтор записи идемпотентен.
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
      enabled: ['lesson_soon', 'lesson_cancelled', 'payment_due', 'payments'],
    });
  });

  it('выбор двух людей не пересекается', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u2', { mode: 'selected', classIds: ['c2'] });

    expect(await service.get('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await service.get('u2')).toEqual({ mode: 'selected', classIds: ['c2'] });
  });

  describe('getManyLessonPrefs', () => {
    it('пустой список — пустая карта', async () => {
      expect(await service.getManyLessonPrefs([])).toEqual(new Map());
    });

    it('пачка одним запросом: у каждого входного id есть запись, у людей без документа — «все» и «как в школе»', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await new NotificationPrefsService(model).set('u2', 'exam_result', false);

      const result = await service.getManyLessonPrefs(['u1', 'u2', 'u3']);

      expect(result).toEqual(
        new Map([
          ['u1', { scope: { mode: 'selected', classIds: ['c1'] } }],
          ['u2', { scope: { mode: 'all', classIds: [] } }],
          ['u3', { scope: { mode: 'all', classIds: [] } }],
        ]),
      );
    });

    it('«за сколько» приезжает вместе с выбором занятий, тем же запросом', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await service.setReminderMinutes('u1', 120);
      await service.setReminderMinutes('u2', 15);

      const result = await service.getManyLessonPrefs(['u1', 'u2', 'u3']);

      expect(result.get('u1')).toEqual({
        scope: { mode: 'selected', classIds: ['c1'] },
        reminderMinutes: 120,
      });
      expect(result.get('u2')).toEqual({
        scope: { mode: 'all', classIds: [] },
        reminderMinutes: 15,
      });
      expect(result.get('u3')).toEqual({ scope: { mode: 'all', classIds: [] } });
    });

    it('чужих людей в результате нет', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await service.set('u9', { mode: 'selected', classIds: ['c9'] });

      const result = await service.getManyLessonPrefs(['u1']);

      expect([...result.keys()]).toEqual(['u1']);
    });
  });

  describe('своё «за сколько минут»', () => {
    it('без документа и без выбора — «как в школе» (undefined)', async () => {
      expect(await service.getReminderMinutes('u1')).toBeUndefined();
      await service.set('u1', { mode: 'all', classIds: [] });
      expect(await service.getReminderMinutes('u1')).toBeUndefined();
    });

    it('выбрал → прочитал: значение на месте (read-after-write)', async () => {
      await service.setReminderMinutes('u1', 30);

      expect(await service.getReminderMinutes('u1')).toBe(30);
    });

    it('новое значение заменяет прежнее, второй раз то же — документ один', async () => {
      await service.setReminderMinutes('u1', 30);
      await service.setReminderMinutes('u1', 120);
      await service.setReminderMinutes('u1', 120);

      expect(await service.getReminderMinutes('u1')).toBe(120);
      expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
    });

    it('null снимает выбор полем, а не нулём: возвращается «как в школе»', async () => {
      await service.setReminderMinutes('u1', 60);
      await service.setReminderMinutes('u1', null);

      expect(await service.getReminderMinutes('u1')).toBeUndefined();
      const stored = await model.findOne({ userId: 'u1' }).lean();
      expect(stored).not.toHaveProperty('lessonReminderMinutes');
    });

    it('сброс там, где ничего не выбирали, документ не заводит', async () => {
      await service.setReminderMinutes('u1', null);

      expect(await model.countDocuments({ userId: 'u1' })).toBe(0);
    });

    it('выбор «за сколько» не трогает выбор занятий и переключатели, и наоборот', async () => {
      const prefs = new NotificationPrefsService(model);
      await prefs.set('u1', 'exam_result', false);
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await service.setReminderMinutes('u1', 15);
      await service.set('u1', { mode: 'all', classIds: ['c1'] });

      expect(await service.getReminderMinutes('u1')).toBe(15);
      expect(await service.get('u1')).toEqual({ mode: 'all', classIds: ['c1'] });
      expect((await prefs.get('u1', [])).enabled).not.toContain('exam_result');
    });

    it('у двух людей выбор не пересекается', async () => {
      await service.setReminderMinutes('u1', 15);
      await service.setReminderMinutes('u2', 120);

      expect(await service.getReminderMinutes('u1')).toBe(15);
      expect(await service.getReminderMinutes('u2')).toBe(120);
    });
  });
});
