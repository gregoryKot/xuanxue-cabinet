// Против настоящей Mongo (CLAUDE.md «Тесты»): объявление пишется через
// SettingsService.update и читается через BoardService — read-after-write по
// двум точкам входа. Время — явный `now`; пояс школы — Asia/Jerusalem, в
// октябре UTC+3 (летнее время до 25.10.2026).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BoardService } from './board.service';

const NOTICE = {
  text: 'Ретрит в ноябре — оплата до 20 октября Маше',
  until: '2026-10-20',
};

function utc(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' });
}

describe('BoardService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let settingsModel: Model<SettingsRecord>;
  let settings: SettingsService;
  let service: BoardService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    settings = new SettingsService(
      settingsModel,
      connection.model<LessonRecord>(LessonRecord.name, LessonSchema),
      connection.model<ClassRecord>(ClassRecord.name, ClassSchema),
      new UsersService(connection.model<UserRecord>(UserRecord.name, UserSchema)),
    );
    service = new BoardService(settings);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await settingsModel.deleteMany({});
  });

  it('на чистой базе объявления нет', async () => {
    expect(await service.getMine(utc('2026-10-06T10:00:00Z'))).toEqual({ notice: null });
  });

  it('до срока: сохранил в настройках — доска отдаёт то же объявление', async () => {
    await settings.update({ boardNotice: NOTICE });

    expect(await service.getMine(utc('2026-10-06T10:00:00Z'))).toEqual({
      notice: NOTICE,
    });
  });

  it('в последний день срока ещё показывает', async () => {
    await settings.update({ boardNotice: NOTICE });

    // 23:59 20 октября в Иерусалиме.
    expect((await service.getMine(utc('2026-10-20T20:59:00Z'))).notice).toEqual(NOTICE);
  });

  it('после срока не показывает', async () => {
    await settings.update({ boardNotice: NOTICE });

    expect(await service.getMine(utc('2026-10-22T10:00:00Z'))).toEqual({ notice: null });
  });

  // В UTC ещё 20-е (21:30Z), а в Иерусалиме уже 00:30 21-го: день берём по
  // поясу школы, поэтому объявление «до 20-го» уже не показывается.
  it('граница дня считается в поясе школы, а не в UTC', async () => {
    await settings.update({ boardNotice: NOTICE });

    expect(await service.getMine(utc('2026-10-20T21:30:00Z'))).toEqual({ notice: null });
  });

  it('сброс `null` убирает объявление с доски', async () => {
    await settings.update({ boardNotice: NOTICE });
    await settings.update({ boardNotice: null });

    expect(await service.getMine(utc('2026-10-06T10:00:00Z'))).toEqual({ notice: null });
  });
});
