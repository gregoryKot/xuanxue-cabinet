// Перенос отмеченных занятий в выбор напоминаний — против настоящей Mongo: правило
// записано конвейером обновления, и мок модели пропустил бы ошибку в самом выражении.
// Документы пишем драйвером напрямую (образец: 0010-drop-user-tz.migration.spec.ts):
// миграция обязана работать на данных, которые лежат на проде до деплоя.
import type { Connection } from 'mongoose';
import { LESSON_SCOPE_CLASS_IDS_MAX } from '@xuanxue/shared';
import { reminderChoicesFromSelectedScope } from './0025-reminder-choices-from-selected-scope.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const PREFS = 'notification_prefs';

const idsFrom = (start: number, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `class-${start + index}`);

describe('Миграция 0025-reminder-choices-from-selected-scope', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createPrefs(userId: string, fields: Record<string, unknown>) {
    await db()
      .collection(PREFS)
      .insertOne({ userId, overrides: [], ...fields });
  }

  async function prefsOf(userId: string): Promise<Record<string, unknown>> {
    const doc = await db().collection(PREFS).findOne({ userId });
    if (!doc) throw new Error(`настройки ${userId} не найдены`);
    return doc;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await db().collection(PREFS).deleteMany({});
  });

  it('«только о выбранных»: занятия попадают в напоминания, ревизия становится 1', async () => {
    await createPrefs('u1', { lessonScopeMode: 'selected', lessonClassIds: ['a', 'b'] });

    const report = await reminderChoicesFromSelectedScope.up(db());

    const doc = await prefsOf('u1');
    expect(doc.reminderClassIds).toEqual(['a', 'b']);
    expect(doc.reminderRevision).toBe(1);
    expect(doc).not.toHaveProperty('mergedReminderClassIds');
    expect(report).toHaveLength(1);
  });

  it('старый фильтр и свои минуты остаются как были', async () => {
    await createPrefs('u1', {
      lessonScopeMode: 'selected',
      lessonClassIds: ['a'],
      lessonReminderMinutes: 0,
    });

    await reminderChoicesFromSelectedScope.up(db());

    expect(await prefsOf('u1')).toMatchObject({
      lessonScopeMode: 'selected',
      lessonClassIds: ['a'],
      lessonReminderMinutes: 0,
    });
  });

  it('режим «все» с запомненными галочками не превращается в напоминания', async () => {
    await createPrefs('u1', { lessonScopeMode: 'all', lessonClassIds: ['a', 'b'] });

    const report = await reminderChoicesFromSelectedScope.up(db());

    const doc = await prefsOf('u1');
    expect(doc).not.toHaveProperty('reminderClassIds');
    expect(doc).not.toHaveProperty('reminderRevision');
    expect(report).toEqual([]);
  });

  it('документ без режима не трогается', async () => {
    await createPrefs('u1', { lessonClassIds: ['a'] });
    await createPrefs('u2', {});

    await reminderChoicesFromSelectedScope.up(db());

    for (const userId of ['u1', 'u2']) {
      const doc = await prefsOf(userId);
      expect(doc).not.toHaveProperty('reminderClassIds');
      expect(doc).not.toHaveProperty('reminderRevision');
    }
  });

  it('«только о выбранных» без единой галочки — честное «ни о каких», подписок нет', async () => {
    await createPrefs('u1', { lessonScopeMode: 'selected', lessonClassIds: [] });
    await createPrefs('u2', { lessonScopeMode: 'selected' });

    await reminderChoicesFromSelectedScope.up(db());

    for (const userId of ['u1', 'u2']) {
      expect(await prefsOf(userId)).not.toHaveProperty('reminderClassIds');
    }
  });

  it('уже сделанный выбор напоминаний сохраняется и объединяется без повторов', async () => {
    await createPrefs('u1', {
      lessonScopeMode: 'selected',
      lessonClassIds: ['a', 'b', 'a'],
      reminderClassIds: ['b', 'z'],
      reminderLessonIds: ['lesson-1'],
      reminderRevision: 4,
    });

    await reminderChoicesFromSelectedScope.up(db());

    expect(await prefsOf('u1')).toMatchObject({
      reminderClassIds: ['b', 'z', 'a'],
      reminderLessonIds: ['lesson-1'],
      reminderRevision: 5,
    });
  });

  it('второй запуск ничего не меняет: ни выбор, ни ревизию', async () => {
    await createPrefs('u1', { lessonScopeMode: 'selected', lessonClassIds: ['a', 'b'] });
    await createPrefs('u2', { lessonScopeMode: 'all', lessonClassIds: ['c'] });
    await reminderChoicesFromSelectedScope.up(db());
    const afterFirst = [await prefsOf('u1'), await prefsOf('u2')];

    const report = await reminderChoicesFromSelectedScope.up(db());

    expect([await prefsOf('u1'), await prefsOf('u2')]).toEqual(afterFirst);
    expect(report).toEqual([]);
  });

  it('все занятия уже выбраны — ревизия не двигается и не появляется', async () => {
    await createPrefs('u1', {
      lessonScopeMode: 'selected',
      lessonClassIds: ['a'],
      reminderClassIds: ['a'],
      reminderRevision: 7,
    });
    await createPrefs('u2', {
      lessonScopeMode: 'selected',
      lessonClassIds: ['a'],
      reminderClassIds: ['a'],
    });

    await reminderChoicesFromSelectedScope.up(db());

    expect(await prefsOf('u1')).toMatchObject({ reminderRevision: 7 });
    expect(await prefsOf('u2')).not.toHaveProperty('reminderRevision');
  });

  it(`в выборе напоминаний не больше ${LESSON_SCOPE_CLASS_IDS_MAX}: свои остаются, новые — пока есть место`, async () => {
    const existing = idsFrom(0, LESSON_SCOPE_CLASS_IDS_MAX - 2);
    const wanted = idsFrom(100, 5);
    await createPrefs('u1', {
      lessonScopeMode: 'selected',
      lessonClassIds: wanted,
      reminderClassIds: existing,
      reminderRevision: 2,
    });

    await reminderChoicesFromSelectedScope.up(db());

    const doc = await prefsOf('u1');
    expect(doc.reminderClassIds).toEqual([...existing, ...wanted.slice(0, 2)]);
    expect(doc.reminderRevision).toBe(3);
  });

  it('место кончилось — ничего не добавляется, ревизия прежняя', async () => {
    const full = idsFrom(0, LESSON_SCOPE_CLASS_IDS_MAX);
    await createPrefs('u1', {
      lessonScopeMode: 'selected',
      lessonClassIds: ['extra'],
      reminderClassIds: full,
      reminderRevision: 9,
    });

    await reminderChoicesFromSelectedScope.up(db());

    expect(await prefsOf('u1')).toMatchObject({
      reminderClassIds: full,
      reminderRevision: 9,
    });
  });

  it('пустая коллекция — отчёт пуст', async () => {
    await expect(reminderChoicesFromSelectedScope.up(db())).resolves.toEqual([]);
  });
});
