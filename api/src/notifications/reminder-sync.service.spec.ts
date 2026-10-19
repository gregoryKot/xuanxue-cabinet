// Снимок настроек напоминаний (ADR-0185): порядок и умолчания — чистый маппер
// без Mongo; чтение «записал → прочитал» и изоляция аккаунтов — против
// настоящей Mongo (CLAUDE.md «Тесты»).
import type { Model } from 'mongoose';
import type { LessonScopeClassDto, SettingsDto } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import type { SettingsService } from '../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { ReminderSyncService, toReminderSyncSnapshot } from './reminder-sync.service';

function scopeClass(id: string): LessonScopeClassDto {
  return { id, title: `Занятие ${id}`, groupLabel: '', tz: 'Asia/Jerusalem', slots: [] };
}

describe('toReminderSyncSnapshot', () => {
  const base = { accountId: 'u1', schoolMinutes: 60, classes: [] };

  it('человек без документа настроек — ревизия "0", пустые списки, лид null', () => {
    expect(toReminderSyncSnapshot({ ...base, prefs: null })).toEqual({
      version: 1,
      accountId: 'u1',
      revision: '0',
      classIds: [],
      lessonIds: [],
      leadMinutes: null,
      schoolMinutes: 60,
      classes: [],
    });
  });

  it('документ без полей напоминаний (трогали только переключатели) читается так же', () => {
    const snapshot = toReminderSyncSnapshot({ ...base, prefs: {} });

    expect(snapshot).toMatchObject({
      revision: '0',
      classIds: [],
      lessonIds: [],
      leadMinutes: null,
    });
  });

  it('списки — без повторов и по кодовым единицам, а не по алфавиту локали', () => {
    const snapshot = toReminderSyncSnapshot({
      ...base,
      prefs: {
        reminderClassIds: ['b', 'B', 'a', 'b', 'é', 'z', '10', '9'],
        reminderLessonIds: ['l2', 'l10', 'l2', 'l1'],
      },
    });

    expect(snapshot.classIds).toEqual(['10', '9', 'B', 'a', 'b', 'z', 'é']);
    expect(snapshot.lessonIds).toEqual(['l1', 'l10', 'l2']);
  });

  it('ревизия отдаётся десятичной строкой', () => {
    const snapshot = toReminderSyncSnapshot({
      ...base,
      prefs: { reminderRevision: 12 },
    });

    expect(snapshot.revision).toBe('12');
  });

  it('своё «за сколько» отдаётся числом, школьное — отдельным полем', () => {
    const snapshot = toReminderSyncSnapshot({
      ...base,
      schoolMinutes: 45,
      prefs: { lessonReminderMinutes: 15 },
    });

    expect(snapshot).toMatchObject({ leadMinutes: 15, schoolMinutes: 45 });
  });

  it('каталог занятий — по id, а входной массив не меняется', () => {
    const classes = [scopeClass('c3'), scopeClass('c10'), scopeClass('c2')];

    const snapshot = toReminderSyncSnapshot({ ...base, classes, prefs: null });

    expect(snapshot.classes.map((c) => c.id)).toEqual(['c10', 'c2', 'c3']);
    expect(classes.map((c) => c.id)).toEqual(['c3', 'c10', 'c2']);
  });

  it('пустой каталог остаётся пустым списком', () => {
    expect(toReminderSyncSnapshot({ ...base, prefs: null }).classes).toEqual([]);
  });
});

describe('ReminderSyncService (Mongo)', () => {
  let memory: MemoryMongo;
  let prefs: Model<NotificationPrefsRecord>;
  let classes: Model<ClassRecord>;
  let service: ReminderSyncService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    prefs = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    classes = memory.connection.model<ClassRecord>(ClassRecord.name);
    const settings = {
      get: () => Promise.resolve({ lessonReminderMinutes: 30 } as SettingsDto),
    } as unknown as SettingsService;
    service = new ReminderSyncService(prefs, classes, settings);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await prefs.deleteMany({});
    await classes.deleteMany({});
  });

  it('новый аккаунт — пустой снимок со школьным значением из настроек школы', async () => {
    const snapshot = await service.getSnapshot('u-new');

    expect(snapshot).toEqual({
      version: 1,
      accountId: 'u-new',
      revision: '0',
      classIds: [],
      lessonIds: [],
      leadMinutes: null,
      schoolMinutes: 30,
      classes: [],
    });
  });

  it('записанное в документ читается отсортированным, а чужой выбор не виден', async () => {
    await prefs.create({
      userId: 'u-a',
      reminderClassIds: ['c2', 'c1', 'c2'],
      reminderLessonIds: ['l9'],
      reminderRevision: 7,
      lessonReminderMinutes: 60,
    });
    await prefs.create({ userId: 'u-b' });

    const a = await service.getSnapshot('u-a');
    const b = await service.getSnapshot('u-b');

    expect(a).toMatchObject({
      accountId: 'u-a',
      revision: '7',
      classIds: ['c1', 'c2'],
      lessonIds: ['l9'],
      leadMinutes: 60,
    });
    expect(b).toMatchObject({
      accountId: 'u-b',
      revision: '0',
      classIds: [],
      lessonIds: [],
      leadMinutes: null,
    });
  });

  it('каталог — активные занятия по id, выключенные не попадают', async () => {
    const rule = { weekday: 2 as const, time: '19:00', durationMin: 60 };
    const first = await classes.create({
      title: 'Яблоко',
      rules: [rule],
      format: 'online',
    });
    const second = await classes.create({
      title: 'Арбуз',
      rules: [rule],
      format: 'online',
    });
    await classes.create({
      title: 'Off',
      active: false,
      rules: [rule],
      format: 'online',
    });

    const { classes: catalogue } = await service.getSnapshot('u1');

    expect(catalogue.map((c) => c.id)).toEqual([first.id, second.id].map(String).sort());
  });
});
