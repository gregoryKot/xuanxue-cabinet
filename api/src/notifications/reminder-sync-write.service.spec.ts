// Запись выбора напоминаний (ADR-0185): против настоящей Mongo — проверка целей,
// «записал → прочитал», потолок, неизменность ревизии, параллельные записи; на
// фейковой модели — ветка проигранной гонки (compare-and-set), которую на живой
// базе не поймать детерминированно (CLAUDE.md «Детерминизм»).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  LESSON_SCOPE_CLASS_IDS_MAX,
  type ReminderChange,
  SettingsDto,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { InvalidInputError, SelectionLimitError } from '../common/errors';
import { LessonRecord } from '../lessons/lesson.schema';
import type { SettingsService } from '../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { ReminderSyncWriteService } from './reminder-sync-write.service';
import { ReminderSyncService } from './reminder-sync.service';

const select = (
  kind: 'class' | 'lesson',
  id: string,
  selected = true,
): ReminderChange => ({
  kind,
  id,
  selected,
});

describe('ReminderSyncWriteService (Mongo)', () => {
  let memory: MemoryMongo;
  let prefs: Model<NotificationPrefsRecord>;
  let classes: Model<ClassRecord>;
  let lessons: Model<LessonRecord>;
  let service: ReminderSyncWriteService;
  let classA: string;
  let classOff: string;
  let lessonA: string;
  let lessonCancelled: string;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    prefs = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    classes = memory.connection.model<ClassRecord>(ClassRecord.name);
    lessons = memory.connection.model<LessonRecord>(LessonRecord.name);
    const settings = {
      get: () => Promise.resolve({ lessonReminderMinutes: 30 } as SettingsDto),
    } as unknown as SettingsService;
    const reader = new ReminderSyncService(prefs, classes, settings);
    service = new ReminderSyncWriteService(prefs, classes, lessons, reader);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    const rule = { weekday: 2 as const, time: '19:00', durationMin: 60 };
    const active = await classes.create({
      title: 'Активное',
      rules: [rule],
      format: 'online',
    });
    const off = await classes.create({
      title: 'Выключенное',
      active: false,
      rules: [rule],
      format: 'online',
    });
    const base = {
      classId: active._id,
      startsAt: DateTime.utc().toJSDate(),
      durationMin: 60,
    };
    const lesson = await lessons.create(base);
    const cancelled = await lessons.create({ ...base, status: 'cancelled' });
    classA = active.id;
    classOff = off.id;
    lessonA = lesson.id;
    lessonCancelled = cancelled.id;
  });

  afterEach(async () => {
    await prefs.deleteMany({});
    await classes.deleteMany({});
    await lessons.deleteMany({});
  });

  const stored = (userId: string) => prefs.findOne({ userId }).lean();

  it('первая запись создаёт документ: ревизия "1", выбор виден в снимке и в базе', async () => {
    const snapshot = await service.patch('u1', [
      select('class', classA),
      select('lesson', lessonA),
      { kind: 'lead', minutes: 0 },
    ]);

    expect(snapshot).toMatchObject({
      accountId: 'u1',
      revision: '1',
      classIds: [classA],
      lessonIds: [lessonA],
      leadMinutes: 0,
      schoolMinutes: 30,
    });
    expect(snapshot.classes.map((c) => c.id)).toEqual([classA]);
    expect(await stored('u1')).toMatchObject({
      reminderClassIds: [classA],
      reminderLessonIds: [lessonA],
      reminderRevision: 1,
      lessonReminderMinutes: 0,
    });
  });

  it('выключенное занятие расписания и отменённое занятие добавить можно', async () => {
    const snapshot = await service.patch('u1', [
      select('class', classOff),
      select('lesson', lessonCancelled),
    ]);

    expect(snapshot).toMatchObject({
      revision: '1',
      classIds: [classOff],
      lessonIds: [lessonCancelled],
    });
  });

  it.each([
    ['занятия расписания', 'class'],
    ['занятия', 'lesson'],
  ] as const)(
    'добавить несуществующее из %s — 400, в базе ничего',
    async (_name, kind) => {
      const missing = 'f'.repeat(24);

      await expect(
        service.patch('u1', [select('class', classA), select(kind, missing)]),
      ).rejects.toBeInstanceOf(InvalidInputError);

      expect(await stored('u1')).toBeNull();
    },
  );

  it('снять несуществующее можно: документ не создаётся, ревизия "0"', async () => {
    const snapshot = await service.patch('u1', [
      select('class', 'f'.repeat(24), false),
      select('lesson', 'e'.repeat(24), false),
    ]);

    expect(snapshot).toMatchObject({ revision: '0', classIds: [], lessonIds: [] });
    expect(await stored('u1')).toBeNull();
  });

  it('снятие и добавление в одном пакете: затронуты только названные ключи', async () => {
    await service.patch('u1', [
      select('class', classA),
      select('lesson', lessonA),
      { kind: 'lead', minutes: 60 },
    ]);

    const snapshot = await service.patch('u1', [
      select('lesson', lessonA, false),
      select('lesson', lessonCancelled),
    ]);

    expect(snapshot).toMatchObject({
      revision: '2',
      classIds: [classA],
      lessonIds: [lessonCancelled],
      leadMinutes: 60,
    });
  });

  it('повтор сохранённого значения и снятие отсутствующего ревизию не двигают', async () => {
    await service.patch('u1', [select('class', classA), { kind: 'lead', minutes: 15 }]);
    const before = await stored('u1');

    const snapshot = await service.patch('u1', [
      select('class', classA),
      select('lesson', lessonA, false),
      { kind: 'lead', minutes: 15 },
    ]);

    expect(snapshot.revision).toBe('1');
    expect(await stored('u1')).toEqual(before);
  });

  it('lead null снимает своё значение: поле удалено, снимок отдаёт null', async () => {
    await service.patch('u1', [{ kind: 'lead', minutes: 120 }]);

    const snapshot = await service.patch('u1', [{ kind: 'lead', minutes: null }]);

    expect(snapshot).toMatchObject({ revision: '2', leadMinutes: null });
    expect(await stored('u1')).not.toHaveProperty('lessonReminderMinutes');
  });

  it('потолок: 51-й выбор — 409, ничего не записано; замена при полном списке проходит', async () => {
    const full = Array.from({ length: LESSON_SCOPE_CLASS_IDS_MAX }, (_, i) =>
      i.toString(16).padStart(24, '0'),
    );
    await prefs.create({ userId: 'u1', reminderClassIds: full, reminderRevision: 4 });

    await expect(service.patch('u1', [select('class', classA)])).rejects.toBeInstanceOf(
      SelectionLimitError,
    );
    expect((await stored('u1'))?.reminderRevision).toBe(4);

    const swapped = await service.patch('u1', [
      select('class', full[0] as string, false),
      select('class', classA),
    ]);
    expect(swapped.revision).toBe('5');
    expect(swapped.classIds).toHaveLength(LESSON_SCOPE_CLASS_IDS_MAX);
  });

  it('документ, созданный старым кодом без ревизии, читается как ревизия 0', async () => {
    await prefs.create({ userId: 'u1', overrides: [] });

    const snapshot = await service.patch('u1', [select('class', classA)]);

    expect(snapshot.revision).toBe('1');
  });

  it('параллельные записи одного аккаунта не теряют друг друга', async () => {
    await service.patch('u1', [select('lesson', lessonA)]);

    const [added, removed] = await Promise.all([
      service.patch('u1', [select('class', classA)]),
      service.patch('u1', [select('lesson', lessonA, false)]),
    ]);

    expect(await stored('u1')).toMatchObject({
      reminderClassIds: [classA],
      reminderLessonIds: [],
      reminderRevision: 3,
    });
    expect([added.revision, removed.revision].sort()).toEqual(['2', '3']);
  });

  it('аккаунты друг друга не задевают', async () => {
    await service.patch('u-a', [select('class', classA)]);

    const b = await service.patch('u-b', [select('lesson', lessonA)]);

    expect(b).toMatchObject({ accountId: 'u-b', classIds: [], lessonIds: [lessonA] });
    expect(await stored('u-a')).toMatchObject({
      reminderClassIds: [classA],
      reminderRevision: 1,
    });
  });
});

describe('ReminderSyncWriteService.commit: проигранная гонка', () => {
  const A = 'a'.repeat(24);
  const B = 'b'.repeat(24);
  const C = 'c'.repeat(24);

  type Stored = {
    reminderClassIds?: string[];
    reminderLessonIds?: string[];
    reminderRevision?: number;
    lessonReminderMinutes?: number;
  } | null;

  function build(reads: Stored[], matched: number[]) {
    const lean = jest.fn();
    for (const read of reads) lean.mockResolvedValueOnce(read);
    const findOne = jest.fn().mockReturnValue({ lean });
    const updateOne = jest.fn();
    for (const count of matched) updateOne.mockResolvedValueOnce({ matchedCount: count });
    const exists = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({});
    const model = { findOne, updateOne, exists, create };
    const service = new ReminderSyncWriteService(
      model as unknown as Model<NotificationPrefsRecord>,
      {} as Model<ClassRecord>,
      {} as Model<LessonRecord>,
      {} as ReminderSyncService,
    );
    return { service, updateOne, findOne, exists, create };
  }

  it('первая условная запись не сработала: состояние перечитано, изменения пересчитаны от него', async () => {
    const { service, updateOne, findOne } = build(
      [
        { reminderClassIds: [A], reminderRevision: 1 },
        { reminderClassIds: [A, B], reminderRevision: 2, lessonReminderMinutes: 30 },
      ],
      [0, 1],
    );

    const committed = await service.commit('u1', [select('class', C)]);

    expect(findOne).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls[0]).toEqual([
      { userId: 'u1', reminderRevision: 1 },
      {
        $set: { reminderClassIds: [A, C], reminderLessonIds: [], reminderRevision: 2 },
        $unset: { lessonReminderMinutes: 1 },
      },
    ]);
    expect(updateOne.mock.calls[1]).toEqual([
      { userId: 'u1', reminderRevision: 2 },
      {
        $set: {
          reminderClassIds: [A, B, C],
          reminderLessonIds: [],
          reminderRevision: 3,
          lessonReminderMinutes: 30,
        },
      },
    ]);
    expect(committed).toEqual({
      reminderClassIds: [A, B, C],
      reminderLessonIds: [],
      reminderRevision: 3,
      lessonReminderMinutes: 30,
    });
  });

  it('после проигрыша чужая запись уже сделала то же самое — изменений нет, вторая запись не нужна', async () => {
    const { service, updateOne } = build(
      [
        { reminderClassIds: [], reminderRevision: 1 },
        { reminderClassIds: [A], reminderRevision: 2 },
      ],
      [0],
    );

    const committed = await service.commit('u1', [select('class', A)]);

    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(committed).toEqual({ reminderClassIds: [A], reminderRevision: 2 });
  });

  it('потолок проверяется на перечитанном состоянии, а не на первом', async () => {
    const full = Array.from({ length: LESSON_SCOPE_CLASS_IDS_MAX }, (_, i) =>
      i.toString(16).padStart(24, '0'),
    );
    const { service, updateOne } = build(
      [
        { reminderClassIds: full.slice(1), reminderRevision: 1 },
        { reminderClassIds: full, reminderRevision: 2 },
      ],
      [0],
    );

    await expect(service.commit('u1', [select('class', A)])).rejects.toBeInstanceOf(
      SelectionLimitError,
    );
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('человек без документа: документ создаётся, условие ревизии 0 принимает и «нет поля»', async () => {
    const { service, updateOne, exists, create } = build([null], [1]);

    await service.commit('u1', [select('lesson', A)]);

    expect(exists).toHaveBeenCalledWith({ userId: 'u1' });
    expect(create).toHaveBeenCalledWith({ userId: 'u1', overrides: [] });
    const [filter] = updateOne.mock.calls[0] as [unknown];
    expect(filter).toEqual({
      userId: 'u1',
      $or: [{ reminderRevision: 0 }, { reminderRevision: { $exists: false } }],
    });
  });

  it('запись без изменений документ не создаёт и не пишет', async () => {
    const { service, updateOne, create } = build([null], []);

    const committed = await service.commit('u1', [select('class', A, false)]);

    expect(committed).toBeNull();
    expect(updateOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('десять проигранных подряд — обычная ошибка (500 с логом), а не бесконечный цикл', async () => {
    const reads = Array.from({ length: 10 }, (_, i) => ({
      reminderClassIds: [],
      reminderRevision: i,
    }));
    const { service, updateOne } = build(reads, Array(10).fill(0) as number[]);

    await expect(service.commit('u1', [select('class', A)])).rejects.toThrow(
      /не сохранилась/,
    );
    expect(updateOne).toHaveBeenCalledTimes(10);
  });
});
