// Против настоящей Mongo (CLAUDE.md «Тесты»): число для штата к выбору «о каких
// занятиях» и «за сколько» (ADR-0162, п. 5). Запрос идёт через `$lookup` по
// строковому `userId`, а мок модели пропустил бы ошибку в самом запросе.
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { LessonPrefsStatsService } from './lesson-prefs-stats.service';
import { LessonScopeService } from './lesson-scope.service';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from './notification-prefs.schema';

describe('LessonPrefsStatsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;
  let service: LessonPrefsStatsService;
  let scopes: LessonScopeService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    prefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
      NotificationPrefsSchema,
    );
    service = new LessonPrefsStatsService(userModel, prefsModel);
    scopes = new LessonScopeService(prefsModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([userModel.deleteMany({}), prefsModel.deleteMany({})]);
  });

  async function person(extra: Partial<UserRecord> = {}): Promise<string> {
    const user = await userModel.create({
      name: 'Ученик',
      roles: [],
      status: 'active',
      ...extra,
    });
    return user._id.toString();
  }

  it('пустая база — честные нули, не undefined и не NaN', async () => {
    await expect(service.getStats()).resolves.toEqual({
      activeStudents: 0,
      chosenClasses: 0,
      ownReminder: 0,
    });
  });

  it('ученики без документа настроек считаются только в «активных»', async () => {
    await person();
    await person();

    await expect(service.getStats()).resolves.toEqual({
      activeStudents: 2,
      chosenClasses: 0,
      ownReminder: 0,
    });
  });

  it('«выбранные» и своя минута считаются независимо: у одного обе, у другого одна', async () => {
    const vanya = await person();
    const masha = await person();
    await person();
    await scopes.set(vanya, { mode: 'selected', classIds: ['a'] });
    await scopes.setReminderMinutes(vanya, 60);
    await scopes.setReminderMinutes(masha, 15);

    await expect(service.getStats()).resolves.toEqual({
      activeStudents: 3,
      chosenClasses: 1,
      ownReminder: 2,
    });
  });

  it('режим «все» с галочками не считается выбором, «выбранные» без галочек — считается', async () => {
    const withTicks = await person();
    const withoutTicks = await person();
    await scopes.set(withTicks, { mode: 'all', classIds: ['a', 'b'] });
    await scopes.set(withoutTicks, { mode: 'selected', classIds: [] });

    await expect(service.getStats()).resolves.toEqual({
      activeStudents: 2,
      chosenClasses: 1,
      ownReminder: 0,
    });
  });

  it('вернулся к «как в школе» — своей минутой уже не считается', async () => {
    const vanya = await person();
    await scopes.setReminderMinutes(vanya, 30);
    await scopes.setReminderMinutes(vanya, null);

    expect((await service.getStats()).ownReminder).toBe(0);
  });

  it('штат и заблокированные не входят ни в одно из трёх чисел', async () => {
    const student = await person();
    const teacher = await person({ roles: ['teacher'] });
    const blocked = await person({ status: 'blocked' });
    for (const id of [student, teacher, blocked]) {
      await scopes.set(id, { mode: 'selected', classIds: ['a'] });
      await scopes.setReminderMinutes(id, 120);
    }

    await expect(service.getStats()).resolves.toEqual({
      activeStudents: 1,
      chosenClasses: 1,
      ownReminder: 1,
    });
  });

  it('документ настроек без ученика (удалён) числа не двигает', async () => {
    await scopes.set('64b000000000000000000001', { mode: 'selected', classIds: ['a'] });
    await person();

    await expect(service.getStats()).resolves.toEqual({
      activeStudents: 1,
      chosenClasses: 0,
      ownReminder: 0,
    });
  });
});
