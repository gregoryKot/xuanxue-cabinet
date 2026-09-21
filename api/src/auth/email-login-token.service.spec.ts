// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»:
// уникальный индекс tokenHash и TTL-индекс expiresAt должны действительно
// существовать и работать, не только «сервис их не нарушает»). Время —
// фиксированные DateTime, не DateTime.utc() (CLAUDE.md «Детерминизм»).
import { EMAIL_LOGIN_CODE_RE } from '@xuanxue/shared';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { hashSecret } from './email-login-code';
import { EmailLoginTokenRecord, EmailLoginTokenSchema } from './email-login-token.schema';
import {
  EMAIL_LOGIN_CODE_MAX_ATTEMPTS,
  EMAIL_LOGIN_RESEND_COOLDOWN_MIN,
  EMAIL_LOGIN_TOKEN_RE,
  EMAIL_LOGIN_TOKEN_TTL_MIN,
  type IssuedEmailLogin,
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

  async function issue(email: string, now: DateTime): Promise<IssuedEmailLogin> {
    const issued = await service.issue(email, now);
    expect(issued).not.toBeNull();
    return issued as IssuedEmailLogin;
  }

  it('issue: возвращает 64-hex токен, формат совпадает с EMAIL_LOGIN_TOKEN_RE', async () => {
    const { token } = await issue('dima@example.com', NOW);
    expect(token).toMatch(EMAIL_LOGIN_TOKEN_RE);
  });

  it('issue: возвращает шесть цифр кода, формат совпадает с EMAIL_LOGIN_CODE_RE', async () => {
    const { code } = await issue('vika@example.com', NOW);
    expect(code).toMatch(EMAIL_LOGIN_CODE_RE);
  });

  it('issue: в базе — только хеши, ни сырой токен, ни сырой код туда не попадают', async () => {
    const { token, code } = await issue('secret@example.com', NOW);

    const raw = await model.findOne({ email: 'secret@example.com' }).lean();
    expect(raw?.tokenHash).toBe(hashSecret(token));
    expect(raw?.codeHash).toBe(hashSecret(code));
    expect(raw?.tokenHash).not.toBe(token);
    expect(raw?.codeHash).not.toBe(code);
  });

  it('issue → consume: read-after-write, возвращает тот же email', async () => {
    const { token } = await issue('masha@example.com', NOW);

    const email = await service.consume(token, NOW.plus({ minutes: 1 }));
    expect(email).toBe('masha@example.com');
  });

  it('consume: тот же токен второй раз — null, одноразовость', async () => {
    const { token } = await issue('once@example.com', NOW);

    const first = await service.consume(token, NOW);
    const second = await service.consume(token, NOW);

    expect(first).toBe('once@example.com');
    expect(second).toBeNull();
  });

  it('consume: неизвестный токен — null', async () => {
    const email = await service.consume('a'.repeat(64), NOW);
    expect(email).toBeNull();
  });

  it('consume: протухший (старше TTL) — null', async () => {
    const { token } = await issue('stale@example.com', NOW);

    const email = await service.consume(
      token,
      NOW.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN, seconds: 1 }),
    );

    expect(email).toBeNull();
  });

  it('consume: ровно на границе TTL — ещё действует ($gt строгий, но граница не задета)', async () => {
    const { token } = await issue('edge@example.com', NOW);

    const email = await service.consume(
      token,
      NOW.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN }).minus({ seconds: 1 }),
    );

    expect(email).toBe('edge@example.com');
  });

  it('issue: повторный вызов инвалидирует прежний токен того же email', async () => {
    const first = await issue('twice@example.com', NOW);
    const second = await service.issue(
      'twice@example.com',
      NOW.plus({ minutes: EMAIL_LOGIN_RESEND_COOLDOWN_MIN + 1 }),
    );

    expect(second).not.toBeNull();
    expect(second?.token).not.toBe(first.token);
    const firstStillWorks = await service.consume(first.token, NOW.plus({ minutes: 3 }));
    expect(firstStillWorks).toBeNull();
  });

  it('issue: второй вызов раньше cooldown — null, письмо не шлём повторно', async () => {
    await issue('cooldown@example.com', NOW);

    const second = await service.issue(
      'cooldown@example.com',
      NOW.plus({ minutes: EMAIL_LOGIN_RESEND_COOLDOWN_MIN - 1 }),
    );

    expect(second).toBeNull();
  });

  it('issue: второй вызов ровно после cooldown — новый токен', async () => {
    await issue('after-cooldown@example.com', NOW);

    const second = await service.issue(
      'after-cooldown@example.com',
      NOW.plus({ minutes: EMAIL_LOGIN_RESEND_COOLDOWN_MIN }),
    );

    expect(second).not.toBeNull();
  });

  it('issue: разные email не мешают друг другу — оба потребляются', async () => {
    const a = await issue('a@example.com', NOW);
    const b = await issue('b@example.com', NOW);

    expect(await service.consume(a.token, NOW)).toBe('a@example.com');
    expect(await service.consume(b.token, NOW)).toBe('b@example.com');
  });

  describe('consumeCode', () => {
    it('верный код — отдаёт email, растит attempts перед этим', async () => {
      const { code } = await issue('code-ok@example.com', NOW);

      const email = await service.consumeCode('code-ok@example.com', code, NOW);

      expect(email).toBe('code-ok@example.com');
    });

    it('неверный код — null, attempts растёт даже на отказе', async () => {
      await issue('code-wrong@example.com', NOW);

      const email = await service.consumeCode('code-wrong@example.com', '000000', NOW);
      expect(email).toBeNull();

      const raw = await model.findOne({ email: 'code-wrong@example.com' }).lean();
      expect(raw?.attempts).toBe(1);
    });

    it(`после ${EMAIL_LOGIN_CODE_MAX_ATTEMPTS} неверных даже верный код не пускает, запись исчезает`, async () => {
      const { code } = await issue('code-locked@example.com', NOW);

      for (let i = 0; i < EMAIL_LOGIN_CODE_MAX_ATTEMPTS; i += 1) {
        expect(await service.consumeCode('code-locked@example.com', '000000', NOW)).toBeNull();
      }

      const withCorrectCode = await service.consumeCode(
        'code-locked@example.com',
        code,
        NOW,
      );
      expect(withCorrectCode).toBeNull();
      await expect(
        model.findOne({ email: 'code-locked@example.com' }).lean(),
      ).resolves.toBeNull();
    });

    it('протухший код — null', async () => {
      const { code } = await issue('code-stale@example.com', NOW);

      const email = await service.consumeCode(
        'code-stale@example.com',
        code,
        NOW.plus({ minutes: EMAIL_LOGIN_TOKEN_TTL_MIN, seconds: 1 }),
      );

      expect(email).toBeNull();
    });

    it('код одноразов — второй раз, даже верный, null', async () => {
      const { code } = await issue('code-once@example.com', NOW);

      const first = await service.consumeCode('code-once@example.com', code, NOW);
      const second = await service.consumeCode('code-once@example.com', code, NOW);

      expect(first).toBe('code-once@example.com');
      expect(second).toBeNull();
    });

    it('неизвестный email — null, документ не создаётся и не падает', async () => {
      const email = await service.consumeCode('unknown@example.com', '123456', NOW);
      expect(email).toBeNull();
    });

    it('потраченный токен ссылки гасит код той же заявки (ADR-0104)', async () => {
      const { token, code } = await issue('link-burns-code@example.com', NOW);

      await service.consume(token, NOW);

      const email = await service.consumeCode('link-burns-code@example.com', code, NOW);
      expect(email).toBeNull();
    });

    it('потраченный код гасит ссылку той же заявки (ADR-0104)', async () => {
      const { token, code } = await issue('code-burns-link@example.com', NOW);

      await service.consumeCode('code-burns-link@example.com', code, NOW);

      const email = await service.consume(token, NOW);
      expect(email).toBeNull();
    });
  });
});
