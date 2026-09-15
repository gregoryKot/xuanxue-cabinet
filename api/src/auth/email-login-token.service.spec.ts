// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»:
// уникальный индекс tokenHash и TTL-индекс expiresAt должны действительно
// существовать и работать, не только «сервис их не нарушает»). Время —
// фиксированные DateTime, не DateTime.utc() (CLAUDE.md «Детерминизм»).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { EmailLoginTokenRecord, EmailLoginTokenSchema } from './email-login-token.schema';
import {
  EMAIL_LOGIN_RESEND_COOLDOWN_MIN,
  EMAIL_LOGIN_TOKEN_RE,
  EMAIL_LOGIN_TOKEN_TTL_MIN,
  EmailLoginTokenService,
} from './email-login-token.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-15T10:00:00.000Z', { zone: 'utc' });

describe('EmailLoginTokenService', () => {
  let memory: MemoryMongo;
  let model: Model<EmailLoginTokenRecord>;
  let service: EmailLoginTokenService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<EmailLoginTokenRecord>(
      EmailLoginTokenRecord.name,
      EmailLoginTokenSchema,
    );
    service = new EmailLoginTokenService(model);
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('issue: возвращает 64-hex токен, формат совпадает с EMAIL_LOGIN_TOKEN_RE', async () => {
    const token = await service.issue('dima@example.com', NOW);
    expect(token).toMatch(EMAIL_LOGIN_TOKEN_RE);
  });

  it('issue → consume: read-after-write, возвращает тот же email', async () => {
    const token = await service.issue('masha@example.com', NOW);
    expect(token).not.toBeNull();

    const email = await service.consume(token as string, NOW.plus({ minutes: 1 }));
    expect(email).toBe('masha@example.com');
  });

  it('consume: тот же токен второй раз — null, одноразовость', async () => {
    const token = await service.issue('once@example.com', NOW);

    const first = await service.consume(token as string, NOW);
    const second = await service.consume(token as string, NOW);

    expect(first).toBe('once@example.com');
    expect(second).toBeNull();
  });

  it('consume: неизвестный токен — null', async () => {
    const email = await service.consume('a'.repeat(64), NOW);
    expect(email).toBeNull();
  });

  it('consume: протухший (старше TTL) — null', async () => {
    const token = await service.issue('stale@example.com', NOW);

    const email = await service.consume(
      token as string,
      NOW.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN, seconds: 1 }),
    );

    expect(email).toBeNull();
  });

  it('consume: ровно на границе TTL — ещё действует ($gt строгий, но граница не задета)', async () => {
    const token = await service.issue('edge@example.com', NOW);

    const email = await service.consume(
      token as string,
      NOW.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN }).minus({ seconds: 1 }),
    );

    expect(email).toBe('edge@example.com');
  });

  it('issue: повторный вызов инвалидирует прежний токен того же email', async () => {
    const first = await service.issue('twice@example.com', NOW);
    const second = await service.issue(
      'twice@example.com',
      NOW.plus({ minutes: EMAIL_LOGIN_RESEND_COOLDOWN_MIN + 1 }),
    );

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    const firstStillWorks = await service.consume(
      first as string,
      NOW.plus({ minutes: 3 }),
    );
    expect(firstStillWorks).toBeNull();
  });

  it('issue: второй вызов раньше cooldown — null, письмо не шлём повторно', async () => {
    await service.issue('cooldown@example.com', NOW);

    const second = await service.issue(
      'cooldown@example.com',
      NOW.plus({ minutes: EMAIL_LOGIN_RESEND_COOLDOWN_MIN - 1 }),
    );

    expect(second).toBeNull();
  });

  it('issue: второй вызов ровно после cooldown — новый токен', async () => {
    await service.issue('after-cooldown@example.com', NOW);

    const second = await service.issue(
      'after-cooldown@example.com',
      NOW.plus({ minutes: EMAIL_LOGIN_RESEND_COOLDOWN_MIN }),
    );

    expect(second).not.toBeNull();
  });

  it('issue: разные email не мешают друг другу — оба потребляются', async () => {
    const tokenA = await service.issue('a@example.com', NOW);
    const tokenB = await service.issue('b@example.com', NOW);

    expect(await service.consume(tokenA as string, NOW)).toBe('a@example.com');
    expect(await service.consume(tokenB as string, NOW)).toBe('b@example.com');
  });
});
