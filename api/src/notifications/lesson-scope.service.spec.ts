// Против настоящей Mongo (CLAUDE.md «Тесты»): выбор «о каких занятиях» (ADR-0162) —
// read-after-write, режим «все» не стирает галочки, пачка одним запросом, повтор
// записи идемпотентен; вместе с ним читаются «за сколько» и выбор напоминаний
// (ADR-0185), которые пишет синхронизация, а не этот сервис.
import type { Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { writeOwnReminderMinutes } from '../test-support/own-reminder-minutes';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { LessonScopeService } from './lesson-scope.service';
import { NotificationPrefsService } from './notification-prefs.service';

// У человека без выбора напоминаний оба множества пусты (ADR-0185).
const NO_REMINDERS = {
  reminderClassIds: new Set<string>(),
  reminderLessonIds: new Set<string>(),
};

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

  const scopeOf = async (userId: string) => (await service.getChoice(userId)).scope;

  it('без документа — обо всех занятиях, галочек нет', async () => {
    expect(await scopeOf('u1')).toEqual({ mode: 'all', classIds: [] });
  });

  it('документ есть, а выбора нет (человек трогал только переключатели) — обо всех', async () => {
    await new NotificationPrefsService(model).set('u1', 'exam_result', false);

    expect(await scopeOf('u1')).toEqual({ mode: 'all', classIds: [] });
  });

  it('выбрал занятия → прочитал: режим и список на месте (read-after-write)', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1', 'c2'] });

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: ['c1', 'c2'] });
  });

  it('«выбранные» без галочек — так и читается, а не превращается в «все»', async () => {
    await service.set('u1', { mode: 'selected', classIds: [] });

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: [] });
  });

  it('вернулся к «всем» — галочки не стёрты, вернулся к «выбранным» — на месте', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u1', { mode: 'all', classIds: ['c1'] });

    expect(await scopeOf('u1')).toEqual({ mode: 'all', classIds: ['c1'] });
    const stored = await model.findOne({ userId: 'u1' }).lean();
    expect(stored?.lessonClassIds).toEqual(['c1']);
  });

  // ADR-0162: «все», выбранное руками, от «всех» по умолчанию читается одинаково —
  // различает их только записанный режим.
  describe('chosen — выбирал ли человек сам', () => {
    it('без документа — нет', async () => {
      expect((await service.getChoice('u1')).chosen).toBe(false);
    });

    it('документ есть, а режима нет (трогал только переключатели или «за сколько») — нет', async () => {
      await new NotificationPrefsService(model).set('u1', 'exam_result', false);
      await writeOwnReminderMinutes(model, 'u2', 30);

      expect((await service.getChoice('u1')).chosen).toBe(false);
      expect((await service.getChoice('u2')).chosen).toBe(false);
    });

    it('записал «все» руками — да, и список режим «все» по-прежнему «все»', async () => {
      await service.set('u1', { mode: 'all', classIds: [] });

      expect(await service.getChoice('u1')).toEqual({
        scope: { mode: 'all', classIds: [] },
        chosen: true,
      });
    });

    it('записал «выбранные» — да, у другого человека по-прежнему нет', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });

      expect((await service.getChoice('u1')).chosen).toBe(true);
      expect((await service.getChoice('u2')).chosen).toBe(false);
    });
  });

  it('повторы id в списке схлопываются, порядок первых вхождений сохранён', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c2', 'c1', 'c2', 'c1'] });

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: ['c2', 'c1'] });
  });

  it('второй раз то же самое — тот же результат, документ один', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
  });

  it('новый список заменяет старый целиком, а не дополняет', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1', 'c2'] });
    await service.set('u1', { mode: 'selected', classIds: ['c3'] });

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: ['c3'] });
  });

  it('выбор сохраняется, переключатели уведомлений не затронуты, и наоборот', async () => {
    const prefs = new NotificationPrefsService(model);
    await prefs.set('u1', 'exam_result', false);
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await prefs.set('u1', 'payments', true);

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await prefs.get('u1', [])).toEqual({
      enabled: ['lesson_soon', 'lesson_cancelled', 'payment_due', 'payments'],
    });
  });

  it('выбор двух людей не пересекается', async () => {
    await service.set('u1', { mode: 'selected', classIds: ['c1'] });
    await service.set('u2', { mode: 'selected', classIds: ['c2'] });

    expect(await scopeOf('u1')).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(await scopeOf('u2')).toEqual({ mode: 'selected', classIds: ['c2'] });
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
          ['u1', { scope: { mode: 'selected', classIds: ['c1'] }, ...NO_REMINDERS }],
          ['u2', { scope: { mode: 'all', classIds: [] }, ...NO_REMINDERS }],
          ['u3', { scope: { mode: 'all', classIds: [] }, ...NO_REMINDERS }],
        ]),
      );
    });

    it('«за сколько» приезжает вместе с выбором занятий, тем же запросом', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await writeOwnReminderMinutes(model, 'u1', 120);
      await writeOwnReminderMinutes(model, 'u2', 15);

      const result = await service.getManyLessonPrefs(['u1', 'u2', 'u3']);

      expect(result.get('u1')).toEqual({
        scope: { mode: 'selected', classIds: ['c1'] },
        reminderMinutes: 120,
        ...NO_REMINDERS,
      });
      expect(result.get('u2')).toEqual({
        scope: { mode: 'all', classIds: [] },
        reminderMinutes: 15,
        ...NO_REMINDERS,
      });
      expect(result.get('u3')).toEqual({
        scope: { mode: 'all', classIds: [] },
        ...NO_REMINDERS,
      });
    });

    // ADR-0185: выбор напоминаний приезжает тем же запросом, что и выбор «о каких».
    it('выбор напоминаний — множествами; нет документа или поля — пустые множества', async () => {
      await model.create({
        userId: 'u1',
        reminderClassIds: ['c1', 'c2'],
        reminderLessonIds: ['l1'],
      });
      await model.create({ userId: 'u2', reminderClassIds: ['c3'] });
      await new NotificationPrefsService(model).set('u3', 'exam_result', false);

      const result = await service.getManyLessonPrefs(['u1', 'u2', 'u3', 'u4']);

      expect(result.get('u1')?.reminderClassIds).toEqual(new Set(['c1', 'c2']));
      expect(result.get('u1')?.reminderLessonIds).toEqual(new Set(['l1']));
      expect(result.get('u2')?.reminderClassIds).toEqual(new Set(['c3']));
      expect(result.get('u2')?.reminderLessonIds).toEqual(new Set());
      expect(result.get('u3')).toMatchObject(NO_REMINDERS);
      expect(result.get('u4')).toMatchObject(NO_REMINDERS);
    });

    it('выбор напоминаний и выбор «о каких» не смешиваются: каждый в своём поле', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['scope-class'] });
      await model.updateOne(
        { userId: 'u1' },
        { $set: { reminderClassIds: ['rem-class'] } },
      );

      const prefs = (await service.getManyLessonPrefs(['u1'])).get('u1');

      expect(prefs?.scope).toEqual({ mode: 'selected', classIds: ['scope-class'] });
      expect(prefs?.reminderClassIds).toEqual(new Set(['rem-class']));
    });

    it('чужих людей в результате нет', async () => {
      await service.set('u1', { mode: 'selected', classIds: ['c1'] });
      await service.set('u9', { mode: 'selected', classIds: ['c9'] });

      const result = await service.getManyLessonPrefs(['u1']);

      expect([...result.keys()]).toEqual(['u1']);
    });
  });
});
