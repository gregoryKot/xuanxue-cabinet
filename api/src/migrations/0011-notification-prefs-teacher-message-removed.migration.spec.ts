// Данные людей, которые успели выключить отменённый вид руками, — на
// настоящей Mongo (образец: 0009-profile-named-at.migration.spec.ts). Пишем
// через нативный драйвер, не Mongoose `.create()`: подсхема overrides —
// enum по `NOTIFICATION_KINDS` (notification-prefs.schema.ts), в котором
// отменённого значения уже нет, `.create()` с ним не пройдёт валидацию — а
// миграция обязана отработать именно на таких документах, оставшихся в
// проде со старого кода.
import { mongo, type Connection } from 'mongoose';
import {
  notificationPrefsTeacherMessageRemoved,
  REMOVED_OVERRIDE_KIND,
} from './0011-notification-prefs-teacher-message-removed.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому `ObjectId` — тот же
// класс, что и внутри mongoose, без второй копии пакета `mongodb`.
const { ObjectId } = mongo;
const NOTIFICATION_PREFS = 'notification_prefs';

interface RawOverride {
  kind: string;
  enabled: boolean;
}

describe('Миграция 0011-notification-prefs-teacher-message-removed', () => {
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
      { kind: REMOVED_OVERRIDE_KIND, enabled: false },
      { kind: 'payments', enabled: true },
    ]);

    await notificationPrefsTeacherMessageRemoved.up(db());

    expect(await overridesOf('u1')).toEqual([{ kind: 'payments', enabled: true }]);
  });

  it('документ без отменённого вида не трогает', async () => {
    await createPrefs('u2', [{ kind: 'lesson_soon', enabled: false }]);

    await notificationPrefsTeacherMessageRemoved.up(db());

    expect(await overridesOf('u2')).toEqual([{ kind: 'lesson_soon', enabled: false }]);
  });

  it('единственный override был отменённым видом — остаётся пустой список, документ не удаляется', async () => {
    await createPrefs('u3', [{ kind: REMOVED_OVERRIDE_KIND, enabled: true }]);

    await notificationPrefsTeacherMessageRemoved.up(db());

    expect(await overridesOf('u3')).toEqual([]);
    expect(
      await db().collection(NOTIFICATION_PREFS).countDocuments({ userId: 'u3' }),
    ).toBe(1);
  });

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    await createPrefs('u4', [{ kind: REMOVED_OVERRIDE_KIND, enabled: false }]);

    await notificationPrefsTeacherMessageRemoved.up(db());
    await notificationPrefsTeacherMessageRemoved.up(db());

    expect(await overridesOf('u4')).toEqual([]);
  });

  it('пустая коллекция молчит', async () => {
    await expect(
      notificationPrefsTeacherMessageRemoved.up(db()),
    ).resolves.toBeUndefined();

    expect(await db().collection(NOTIFICATION_PREFS).countDocuments()).toBe(0);
  });
});
