// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// rotate() инвалидирует старую ссылку — read-after-write, isValid() по хешу,
// getCurrent()/rotate() без PUBLIC_URL — NotAvailableError (ADR-0030).
import type { Connection, Model } from 'mongoose';
import type { ConfigService } from '@nestjs/config';
import { NotAvailableError } from '../common/errors';
import { InviteLinkRecord, InviteLinkSchema } from './invite-link.schema';
import { InviteLinkService } from './invite-link.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const PUBLIC_URL = 'https://xuanxue.su';
const ADMIN_ID = '650000000000000000000001';

function fakeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (name: string) => env[name] } as unknown as ConfigService;
}

describe('InviteLinkService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<InviteLinkRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<InviteLinkRecord>(InviteLinkRecord.name, InviteLinkSchema);
    await model.syncIndexes();
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  function service(
    env: Record<string, string | undefined> = { PUBLIC_URL },
  ): InviteLinkService {
    return new InviteLinkService(fakeConfig(env), model);
  }

  it('getCurrent: ссылки ещё нет — url: null', async () => {
    await expect(service().getCurrent()).resolves.toEqual({ url: null });
  });

  it('getCurrent/rotate без PUBLIC_URL — NotAvailableError', async () => {
    const svc = service({ PUBLIC_URL: undefined });
    await expect(svc.getCurrent()).rejects.toBeInstanceOf(NotAvailableError);
    await expect(svc.rotate(ADMIN_ID)).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('rotate → getCurrent: read-after-write, url ведёт на /join/<code>', async () => {
    const svc = service();
    const { url } = await svc.rotate(ADMIN_ID);
    expect(url).toMatch(new RegExp(`^${PUBLIC_URL}/join/[0-9a-f]{32}$`));

    await expect(svc.getCurrent()).resolves.toEqual({ url });
  });

  it('код из rotate() валиден для isValid()', async () => {
    const svc = service();
    const { url } = await svc.rotate(ADMIN_ID);
    const code = url?.split('/join/')[1] ?? '';

    await expect(svc.isValid(code)).resolves.toBe(true);
  });

  it('rotate второй раз — прежний код перестаёт проходить isValid (отзыв)', async () => {
    const svc = service();
    const first = await svc.rotate(ADMIN_ID);
    const firstCode = first.url?.split('/join/')[1] ?? '';

    const second = await svc.rotate(ADMIN_ID);

    await expect(svc.isValid(firstCode)).resolves.toBe(false);
    expect(second.url).not.toBe(first.url);
    await expect(model.countDocuments({})).resolves.toBe(1);
  });

  it('isValid: неизвестный и неверно оформленный код — false', async () => {
    const svc = service();
    await expect(svc.isValid('0'.repeat(32))).resolves.toBe(false);
    await expect(svc.isValid('не-hex-код')).resolves.toBe(false);
  });

  it('в базе код хранится не в открытом виде', async () => {
    const svc = service();
    const { url } = await svc.rotate(ADMIN_ID);
    const code = url?.split('/join/')[1] ?? '';

    const raw = await model.findOne({}).lean<{ code: string } | null>();
    expect(raw?.code).toBeDefined();
    expect(raw?.code).not.toBe(code);
  });
});
