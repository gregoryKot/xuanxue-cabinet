// Против настоящей Mongo (CLAUDE.md «Тесты»): кому шаги тика о занятии вообще
// могут писать (ADR-0162). Один поиск на два шага — «Занятие скоро» и
// «Занятие отменено» — поэтому его проверяет отдельный спек, а не только
// спеки самих шагов: вид — параметр, и у разных видов получатели разные.
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { LessonRecipientsService } from './lesson-recipients.service';
import { LessonScopeService } from './lesson-scope.service';
import { NotificationPrefsService } from './notification-prefs.service';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from './notification-prefs.schema';

describe('LessonRecipientsService.findFor', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;
  let service: LessonRecipientsService;
  let prefs: NotificationPrefsService;
  let scopes: LessonScopeService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    prefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
      NotificationPrefsSchema,
    );
    prefs = new NotificationPrefsService(prefsModel);
    scopes = new LessonScopeService(prefsModel);
    service = new LessonRecipientsService(userModel, prefs, scopes);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([userModel.deleteMany({}), prefsModel.deleteMany({})]);
  });

  async function person(name: string, extra: Partial<UserRecord> = {}): Promise<string> {
    const user = await userModel.create({ name, roles: [], status: 'active', ...extra });
    return user._id.toString();
  }

  it('активные ученики с включённым видом — без переключения руками: дефолт ученика', async () => {
    const vanya = await person('Ваня');
    const masha = await person('Маша');

    const { recipients, prefs: lessonPrefs } = await service.findFor('lesson_cancelled');

    expect(recipients.map((r) => r.id).sort()).toEqual([vanya, masha].sort());
    // Выбор есть у каждого получателя: нет записи — «обо всех» и «как в школе».
    expect(lessonPrefs.get(vanya)).toEqual({ scope: { mode: 'all', classIds: [] } });
    expect(lessonPrefs.get(masha)).toEqual({ scope: { mode: 'all', classIds: [] } });
  });

  it('вид выключен — человека в списке нет, а по другому виду он есть: вид — параметр', async () => {
    const vanya = await person('Ваня');
    await prefs.set(vanya, 'lesson_cancelled', false);

    expect((await service.findFor('lesson_cancelled')).recipients).toEqual([]);
    expect((await service.findFor('lesson_soon')).recipients.map((r) => r.id)).toEqual([
      vanya,
    ]);
  });

  it('штат и заблокированные не получатели: только люди без ролей и активные', async () => {
    const student = await person('Ученик');
    await person('Учитель', { roles: ['teacher'] });
    await person('Админ', { roles: ['admin'] });
    await person('Заблокированный', { status: 'blocked' });

    const { recipients } = await service.findFor('lesson_cancelled');

    expect(recipients.map((r) => r.id)).toEqual([student]);
  });

  // ADR-0163: владелец включил режим ученика и хочет увидеть, что придёт
  // ученику, — напоминание об уроке находит его как ученика, по дефолту ученика.
  describe('штат в режиме ученика (ADR-0163)', () => {
    const MOMENT = new Date('2026-10-01T10:00:00Z');

    it('учитель в режиме — получатель lesson_soon: дефолт ученика, не штатный', async () => {
      const teacher = await person('Учитель', {
        roles: ['teacher'],
        studentModeAt: MOMENT,
      });

      const { recipients, prefs: lessonPrefs } = await service.findFor('lesson_soon');

      expect(recipients.map((r) => r.id)).toEqual([teacher]);
      expect(lessonPrefs.get(teacher)).toEqual({ scope: { mode: 'all', classIds: [] } });
    });

    it('выключил режим — из получателей пропал: чтение read-after-write по базе', async () => {
      const admin = await person('Админ', { roles: ['admin'], studentModeAt: MOMENT });
      expect((await service.findFor('lesson_soon')).recipients).toHaveLength(1);

      await userModel.updateOne({ _id: admin }, { $unset: { studentModeAt: 1 } });

      expect((await service.findFor('lesson_soon')).recipients).toEqual([]);
    });

    it('вид выключен личным переключателем — режим его не обходит', async () => {
      const teacher = await person('Учитель', {
        roles: ['teacher'],
        studentModeAt: MOMENT,
      });
      await prefs.set(teacher, 'lesson_soon', false);

      expect((await service.findFor('lesson_soon')).recipients).toEqual([]);
    });

    it('видов штата в режиме нет: post_draft получает только штат по ролям, не ученик', async () => {
      await person('Учитель', { roles: ['teacher'], studentModeAt: MOMENT });

      expect((await service.findFor('post_draft')).recipients).toEqual([]);
    });

    it('застрявший флаг без роли штата (бухгалтер) — не режим, получателем не становится', async () => {
      await person('Бухгалтер', { roles: ['accountant'], studentModeAt: MOMENT });

      expect((await service.findFor('lesson_soon')).recipients).toEqual([]);
    });

    it('заблокированный штат в режиме не получает', async () => {
      await person('Учитель', {
        roles: ['teacher'],
        studentModeAt: MOMENT,
        status: 'blocked',
      });

      expect((await service.findFor('lesson_soon')).recipients).toEqual([]);
    });
  });

  it('выбор «о каких занятиях» приходит вместе с получателем, у каждого свой', async () => {
    const picky = await person('Ваня');
    const plain = await person('Маша');
    await scopes.set(picky, { mode: 'selected', classIds: ['c1'] });
    await scopes.setReminderMinutes(picky, 30);

    const { prefs: lessonPrefs } = await service.findFor('lesson_soon');

    expect(lessonPrefs.get(picky)).toEqual({
      scope: { mode: 'selected', classIds: ['c1'] },
      reminderMinutes: 30,
    });
    expect(lessonPrefs.get(plain)).toEqual({ scope: { mode: 'all', classIds: [] } });
  });

  it('учеников нет — пустой список и пустой выбор, без ошибки', async () => {
    const result = await service.findFor('lesson_cancelled');

    expect(result.recipients).toEqual([]);
    expect(result.prefs.size).toBe(0);
  });
});
