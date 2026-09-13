// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): сортировка
// списка и оба ограничения updateRoles (последний админ, самоснятие). Отдельный
// файл и своя память Mongo от users.service.spec.ts — тесты ниже опираются на
// точное число админов в базе, общее состояние с другим файлом мигало бы.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { UserRecord, UserSchema } from './user.schema';
import { UserRolesService } from './user-roles.service';
import { UsersService } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

function openService(memory: MemoryMongo): {
  model: Model<UserRecord>;
  roles: UserRolesService;
  users: UsersService;
} {
  const model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
  const users = new UsersService(model);
  return { model, roles: new UserRolesService(model, users), users };
}

describe('UserRolesService', () => {
  let memory: MemoryMongo;
  let roles: UserRolesService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    ({ roles, users } = openService(memory));
    await memory.connection.model<UserRecord>(UserRecord.name, UserSchema).syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  describe('list', () => {
    it('сортирует по lastLoginAt — свежий вход сверху', async () => {
      const older = await users.createFromTelegram({
        telegramId: 1001,
        name: 'Раньше',
        roles: ['teacher'],
        status: 'active',
      });
      const newer = await users.createFromTelegram({
        telegramId: 1002,
        name: 'Позже',
        roles: ['teacher'],
        status: 'active',
      });
      await users.touchLogin(older.id, DateTime.fromISO('2026-01-01T00:00:00Z'));
      await users.touchLogin(newer.id, DateTime.fromISO('2026-02-01T00:00:00Z'));

      const list = await roles.list({});
      const ids = list.map((u) => u.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    });

    it('лимит ограничивает число строк', async () => {
      const list = await roles.list({ limit: 1 });
      expect(list).toHaveLength(1);
    });
  });

  describe('updateRoles', () => {
    it('несуществующий id — NotFoundError', async () => {
      await expect(
        roles.updateRoles('507f1f77bcf86cd799439011', ['teacher'], 'кто-то'),
      ).rejects.toThrow('Пользователь не найден');
    });

    it('обычная смена ролей применяется и видна при повторном чтении', async () => {
      const user = await users.createFromTelegram({
        telegramId: 2001,
        name: 'Гриша',
        roles: [],
        status: 'active',
      });

      const updated = await roles.updateRoles(user.id, ['teacher'], 'другой-админ');
      expect(updated.roles).toEqual(['teacher']);

      const found = await users.findById(user.id);
      expect(found?.roles).toEqual(['teacher']);
    });

    it('невалидный ObjectId — NotFoundError, не падение', async () => {
      await expect(
        roles.updateRoles('не-objectid', ['teacher'], 'кто-то'),
      ).rejects.toThrow('Пользователь не найден');
    });

    it('роли поменялись между чтением и записью (гонка) — NotFoundError', async () => {
      const user = await users.createFromTelegram({
        telegramId: 2005,
        name: 'Настя',
        roles: ['teacher'],
        status: 'active',
      });
      // Второй админ успел применить свою правку между чтением target внутри
      // updateRoles и условным findOneAndUpdate — имитируем подменой чтения:
      // findOneAndUpdate дальше ищет по устаревшему набору ролей и не находит
      // документ (комментарий в user-roles.service.ts про условный апдейт).
      jest.spyOn(users, 'findById').mockResolvedValueOnce({
        id: user.id,
        name: user.name,
        roles: ['admin'],
        tz: 'Asia/Jerusalem',
        status: 'active',
      });

      await expect(
        roles.updateRoles(user.id, ['teacher', 'admin'], 'кто-то-другой'),
      ).rejects.toThrow('Пользователь не найден');
    });

    it('снять admin у самого себя — ForbiddenError с текстом про самоснятие', async () => {
      const admin = await users.createFromTelegram({
        telegramId: 2002,
        name: 'Маша',
        roles: ['admin'],
        status: 'active',
      });
      // Второй админ — иначе сработала бы проверка «последний админ» раньше
      // проверки самоснятия, и текст ошибки был бы не тот, что тестируем.
      await users.createFromTelegram({
        telegramId: 2003,
        name: 'Второй админ',
        roles: ['admin'],
        status: 'active',
      });

      await expect(roles.updateRoles(admin.id, [], admin.id)).rejects.toThrow(
        'снимает другой администратор',
      );
    });

    it('снять admin у последнего админа в базе — ForbiddenError', async () => {
      // Своя изолированная база: список admin из предыдущих тестов файла не
      // должен влиять на подсчёт «последнего».
      const solo = await openMemoryMongo();
      const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
      await soloModel.syncIndexes();
      const { roles: soloRoles, users: soloUsers } = openService(solo);
      const onlyAdmin = await soloUsers.createFromTelegram({
        telegramId: 3001,
        name: 'Единственный админ',
        roles: ['admin'],
        status: 'active',
      });

      await expect(
        soloRoles.updateRoles(onlyAdmin.id, ['teacher'], 'кто-то-другой'),
      ).rejects.toThrow('последний администратор');

      await solo.stop();
    }, 30_000);

    it('снять admin у не-последнего админа — проходит', async () => {
      const solo = await openMemoryMongo();
      const soloModel = solo.connection.model<UserRecord>(UserRecord.name, UserSchema);
      await soloModel.syncIndexes();
      const { roles: soloRoles, users: soloUsers } = openService(solo);
      const first = await soloUsers.createFromTelegram({
        telegramId: 3002,
        name: 'Админ 1',
        roles: ['admin'],
        status: 'active',
      });
      await soloUsers.createFromTelegram({
        telegramId: 3003,
        name: 'Админ 2',
        roles: ['admin'],
        status: 'active',
      });

      const updated = await soloRoles.updateRoles(first.id, ['teacher'], 'кто-то-другой');
      expect(updated.roles).toEqual(['teacher']);

      await solo.stop();
    }, 30_000);
  });
});
