// Данные людей, которые успели переключить отменённый вид руками, — на
// настоящей Mongo (образец: 0009-profile-named-at.migration.spec.ts). Пишем
// через нативный драйвер, не Mongoose `.create()`: подсхема overrides — enum
// по `NOTIFICATION_KINDS` (notification-prefs.schema.ts), в котором
// отменённых значений уже нет, `.create()` с ними не пройдёт валидацию — а
// миграция обязана отработать именно на таких документах, оставшихся в проде
// со старого кода.
//
// Один спек на обе миграции-удаления, а не два почти одинаковых: механика у
// них общая (pull-notification-override.ts), различаются только `id` и
// убираемое значение — их и проверяет таблица в конце файла (CLAUDE.md
// «Дубли», гейт jscpd с нулевым бейслайном).
import { mongo, type Connection } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  notificationPrefsTeacherMessageRemoved,
  REMOVED_KIND_TEACHER_MESSAGE,
} from './0011-notification-prefs-teacher-message-removed.migration';
import {
  notificationPrefsLessonSoonRemoved,
  REMOVED_KIND_LESSON_SOON,
} from './0012-notification-prefs-lesson-soon-removed.migration';
import { pullNotificationOverride } from './pull-notification-override';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому `ObjectId` — тот же
// класс, что и внутри mongoose, без второй копии пакета `mongodb`.
const { ObjectId } = mongo;
const NOTIFICATION_PREFS = 'notification_prefs';

// Вид, который в контракте остаётся, — «соседний переключатель», которого
// удаление касаться не должно.
const KEPT_KIND = 'payments';

interface RawOverride {
  kind: string;
  enabled: boolean;
}

describe('pullNotificationOverride', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createPrefs(userId: string, overrides: RawOverride[]): Promise<void> {
    await db()
      .collection(NOTIFICATION_PREFS)
      .insertOne({ _id: new ObjectId(), userId, overrides });
  }

  async function overridesOf(userId: string): Promise<RawOverride[] | undefined> {
    const doc = await db().collection(NOTIFICATION_PREFS).findOne({ userId });
    return doc?.overrides as RawOverride[] | undefined;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await db().collection(NOTIFICATION_PREFS).deleteMany({});
  });

  it('убирает отменённый вид из overrides, остальные не трогает', async () => {
    await createPrefs('u1', [
      { kind: REMOVED_KIND_TEACHER_MESSAGE, enabled: false },
      { kind: KEPT_KIND, enabled: true },
    ]);

    await pullNotificationOverride(db(), REMOVED_KIND_TEACHER_MESSAGE);

    expect(await overridesOf('u1')).toEqual([{ kind: KEPT_KIND, enabled: true }]);
  });

  it('документ без отменённого вида не трогает', async () => {
    await createPrefs('u2', [{ kind: KEPT_KIND, enabled: false }]);

    await pullNotificationOverride(db(), REMOVED_KIND_TEACHER_MESSAGE);

    expect(await overridesOf('u2')).toEqual([{ kind: KEPT_KIND, enabled: false }]);
  });

  it('единственный override был отменённым видом — остаётся пустой список, документ не удаляется', async () => {
    await createPrefs('u3', [{ kind: REMOVED_KIND_TEACHER_MESSAGE, enabled: true }]);

    await pullNotificationOverride(db(), REMOVED_KIND_TEACHER_MESSAGE);

    expect(await overridesOf('u3')).toEqual([]);
    expect(
      await db().collection(NOTIFICATION_PREFS).countDocuments({ userId: 'u3' }),
    ).toBe(1);
  });

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    await createPrefs('u4', [{ kind: REMOVED_KIND_TEACHER_MESSAGE, enabled: false }]);

    await pullNotificationOverride(db(), REMOVED_KIND_TEACHER_MESSAGE);
    await pullNotificationOverride(db(), REMOVED_KIND_TEACHER_MESSAGE);

    expect(await overridesOf('u4')).toEqual([]);
  });

  it('пустая коллекция молчит', async () => {
    await expect(
      pullNotificationOverride(db(), REMOVED_KIND_TEACHER_MESSAGE),
    ).resolves.toBeUndefined();

    expect(await db().collection(NOTIFICATION_PREFS).countDocuments()).toBe(0);
  });

  // Каждая миграция убирает своё значение и не трогает чужое — иначе
  // перепутанная константа прошла бы мимо тестов механики выше. Вместе с
  // ней проверяется `id`: поменять его у закоммиченной миграции нельзя,
  // раннер сочтёт её новой и применит повторно (migrations.ts).
  describe.each([
    {
      migration: notificationPrefsTeacherMessageRemoved,
      id: '0011-notification-prefs-teacher-message-removed',
      removed: REMOVED_KIND_TEACHER_MESSAGE,
      survives: REMOVED_KIND_LESSON_SOON,
    },
    {
      migration: notificationPrefsLessonSoonRemoved,
      id: '0012-notification-prefs-lesson-soon-removed',
      removed: REMOVED_KIND_LESSON_SOON,
      survives: REMOVED_KIND_TEACHER_MESSAGE,
    },
  ])('$id', ({ migration, id, removed, survives }) => {
    it('id совпадает с именем файла — по нему раннер помнит применённые', () => {
      expect(migration.id).toBe(id);
    });

    it('убирает своё значение и оставляет значение соседней миграции', async () => {
      await createPrefs('u5', [
        { kind: removed, enabled: false },
        { kind: survives, enabled: true },
      ]);

      await migration.up(db());

      expect(await overridesOf('u5')).toEqual([{ kind: survives, enabled: true }]);
    });
  });
});
