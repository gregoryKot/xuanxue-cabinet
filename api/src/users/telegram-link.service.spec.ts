// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): решение зависит от двух моделей сразу (аккаунт + код связки), и
// гонка на частичном уникальном индексе telegramId должна быть настоящей
// параллельной записью, не симуляцией. Время — фиксированный DateTime
// (CLAUDE.md «Детерминизм»).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { BotIdentityService } from '../telegram/bot-identity.service';
import { attachTelegramId } from './attach-telegram-id';
import {
  TelegramLinkCodeRecord,
  TelegramLinkCodeSchema,
} from './telegram-link-code.schema';
import { TelegramLinkCodeService } from './telegram-link-code.service';
import { TelegramLinkService } from './telegram-link.service';
import { UserRecord, UserSchema } from './user.schema';
import { UsersService, type UserLean } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-16T10:00:00.000Z', { zone: 'utc' });

function fakeBotIdentity(): BotIdentityService {
  return { get: () => 'xuanxue_bot' } as unknown as BotIdentityService;
}

describe('TelegramLinkService.linkByCode', () => {
  let memory: MemoryMongo;
  let userModel: Model<UserRecord>;
  let codeModel: Model<TelegramLinkCodeRecord>;
  let users: UsersService;
  let linkCodes: TelegramLinkCodeService;
  let service: TelegramLinkService;
  let counter = 0;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    userModel = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    codeModel = memory.connection.model<TelegramLinkCodeRecord>(
      TelegramLinkCodeRecord.name,
      TelegramLinkCodeSchema,
    );
    users = new UsersService(userModel);
    linkCodes = new TelegramLinkCodeService(fakeBotIdentity(), codeModel);
    service = new TelegramLinkService(linkCodes, users);
  }, 60_000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await userModel.deleteMany({});
    await codeModel.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  async function createStudent(): Promise<UserLean> {
    counter += 1;
    const doc = await userModel.create({
      name: 'Ученик по почте',
      email: `student-${counter}@example.com`,
      roles: [],
    });
    const found = await users.findById(doc._id.toString());
    if (!found) throw new Error('setup: пользователь не создан');
    return found;
  }

  async function issueCode(userId: string): Promise<string> {
    const { telegramUrl } = await linkCodes.issueLink(userId, NOW);
    const [, code] = telegramUrl.split('start=link_');
    if (!code) throw new Error('setup: код не собрался');
    return code;
  }

  it('неизвестный код — invalid', async () => {
    await expect(service.linkByCode('a'.repeat(32), 111, NOW)).resolves.toEqual({
      kind: 'invalid',
    });
  });

  it('код валиден, но аккаунта из кода уже нет — invalid', async () => {
    const student = await createStudent();
    const code = await issueCode(student.id);
    await userModel.deleteOne({ _id: student.id });

    await expect(service.linkByCode(code, 111, NOW)).resolves.toEqual({
      kind: 'invalid',
    });
  });

  it('этот telegramId уже ключ входа другого человека — taken', async () => {
    const student = await createStudent();
    const code = await issueCode(student.id);
    await userModel.create({ name: 'Уже в Telegram', telegramId: 222, roles: [] });

    await expect(service.linkByCode(code, 222, NOW)).resolves.toEqual({ kind: 'taken' });
  });

  it('у аккаунта из кода уже есть ДРУГОЙ telegramId — other-telegram', async () => {
    const student = await createStudent();
    await userModel.updateOne({ _id: student.id }, { $set: { telegramId: 333 } });
    const code = await issueCode(student.id);

    await expect(service.linkByCode(code, 444, NOW)).resolves.toEqual({
      kind: 'other-telegram',
    });
  });

  it('успех — linked, telegramId записан, read-after-write', async () => {
    const student = await createStudent();
    const code = await issueCode(student.id);

    const result = await service.linkByCode(code, 555, NOW);

    expect(result.kind).toBe('linked');
    if (result.kind !== 'linked') throw new Error('unreachable');
    expect(result.user.telegramId).toBe(555);
    await expect(users.findById(student.id)).resolves.toMatchObject({ telegramId: 555 });
  });

  it('код одноразовый — повторное применение того же кода после успеха — invalid', async () => {
    const student = await createStudent();
    const code = await issueCode(student.id);
    await service.linkByCode(code, 666, NOW);

    await expect(service.linkByCode(code, 666, NOW)).resolves.toEqual({
      kind: 'invalid',
    });
  });

  it('идемпотентный повтор: новый код той же связки, тот же telegramId — linked без ошибки', async () => {
    const student = await createStudent();
    const firstCode = await issueCode(student.id);
    await service.linkByCode(firstCode, 777, NOW);

    const secondCode = await issueCode(student.id);
    const result = await service.linkByCode(secondCode, 777, NOW.plus({ minutes: 1 }));

    expect(result.kind).toBe('linked');
    if (result.kind !== 'linked') throw new Error('unreachable');
    expect(result.user.telegramId).toBe(777);
  });

  it('гонка двух связок с одним и тем же telegramId на разные аккаунты — один linked, другой taken', async () => {
    const studentA = await createStudent();
    const studentB = await createStudent();
    const codeA = await issueCode(studentA.id);
    const codeB = await issueCode(studentB.id);

    const [resultA, resultB] = await Promise.all([
      service.linkByCode(codeA, 888, NOW),
      service.linkByCode(codeB, 888, NOW),
    ]);

    expect([resultA.kind, resultB.kind].sort()).toEqual(['linked', 'taken']);
  });

  // Тест выше проверяет инвариант гонки («один связался, второй получил
  // отказ»), но каким из двух путей проигравший получит отказ, решает
  // тайминг: успел ли конкурент записаться до проверки владельца или после
  // неё. Из-за этого ветка «поймал уникальный индекс» исполнялась через раз
  // и перестала исполняться совсем при подъёме драйвера mongodb до 7.6.
  // Здесь то же самое без тайминга: владелец уже в базе, а проверка
  // владельца отвечает пустотой — ровно так гонка и выглядит изнутри, — и
  // запись упирается в настоящий частичный уникальный индекс.
  it('конкурент записался после проверки владельца — отказ ловит уникальный индекс', async () => {
    const owner = await createStudent();
    await users.attachTelegramId(owner.id, 999);
    const student = await createStudent();
    const code = await issueCode(student.id);
    const ownerCheck = jest.spyOn(users, 'findByTelegramId').mockResolvedValueOnce(null);

    await expect(service.linkByCode(code, 999, NOW)).resolves.toEqual({ kind: 'taken' });

    ownerCheck.mockRestore();
  });

  it('аккаунт из кода заблокирован — blocked, telegramId не записан', async () => {
    const student = await createStudent();
    await userModel.updateOne({ _id: student.id }, { $set: { status: 'blocked' } });
    const code = await issueCode(student.id);

    await expect(service.linkByCode(code, 999, NOW)).resolves.toEqual({
      kind: 'blocked',
    });
    // Read-after-write: отказ не должен оставить после себя полузаписанный
    // telegramId (CLAUDE.md «Тесты» — «сохранил → нашёл» и для отказа тоже).
    const found = await users.findById(student.id);
    expect(found).not.toBeNull();
    expect(found?.telegramId).toBeUndefined();
  });

  it('код сгорает и при отказе — повторное применение того же кода даёт invalid', async () => {
    const student = await createStudent();
    await userModel.updateOne({ _id: student.id }, { $set: { status: 'blocked' } });
    const code = await issueCode(student.id);
    await service.linkByCode(code, 999, NOW);

    await expect(service.linkByCode(code, 999, NOW)).resolves.toEqual({
      kind: 'invalid',
    });
  });

  it('заблокированный, у которого Telegram уже привязан, — blocked, не linked', async () => {
    const student = await createStudent();
    await userModel.updateOne(
      { _id: student.id },
      { $set: { status: 'blocked', telegramId: 1010 } },
    );
    const code = await issueCode(student.id);

    // Идемпотентная ветка (target.telegramId === telegramId) не должна
    // обгонять проверку статуса — иначе заблокированный с уже стоящим
    // telegramId получал бы `linked` вместо отказа.
    await expect(service.linkByCode(code, 1010, NOW)).resolves.toEqual({
      kind: 'blocked',
    });
  });

  it('доступ закрыли между чтением и записью — blocked', async () => {
    const student = await createStudent();
    const code = await issueCode(student.id);
    // Саму гонку «админ заблокировал ровно между чтением (findById в сервисе)
    // и записью (attachTelegramId)» настоящими параллельными запросами не
    // поставить детерминированно — подменяем только момент записи, вставляя
    // блокировку перед ней. Запись и последующее чтение остаются настоящими:
    // мок вызывает attachTelegramId из attach-telegram-id.ts, а не имитирует
    // её результат.
    jest.spyOn(users, 'attachTelegramId').mockImplementation(async (id, tgId) => {
      await userModel.updateOne({ _id: id }, { $set: { status: 'blocked' } });
      return attachTelegramId(userModel, id, tgId);
    });

    await expect(service.linkByCode(code, 2020, NOW)).resolves.toEqual({
      kind: 'blocked',
    });
  });
});
