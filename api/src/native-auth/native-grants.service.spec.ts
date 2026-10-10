// Против настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»): мок пропустил
// бы ошибку в самом запросе — например, фильтр `revokedAt: null` или `$max`.
// Время — явный `now`, никаких часов машины. Случаи N08, N09, N11, N12, N13 —
// из «Common conformance cases» профиля Workshop 3c98d4a.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  NATIVE_CREDENTIAL_LIFETIME_SEC,
  NATIVE_RENEW_THRESHOLD_SEC,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { NativeAuthError } from './native-auth-error';
import { NativeCredentialRecord } from './native-credential.schema';
import { NativeGrantRecord } from './native-grant.schema';
import { NativeGrantsService } from './native-grants.service';
import { sha256Hex } from './native-secrets';

const T0 = DateTime.fromISO('2026-10-01T12:00:00Z', { zone: 'utc' });
const LIFETIME = NATIVE_CREDENTIAL_LIFETIME_SEC;
const THRESHOLD = NATIVE_RENEW_THRESHOLD_SEC;

function at(seconds: number): DateTime {
  return T0.plus({ seconds });
}

describe('NativeGrantsService (Mongo)', () => {
  let memory: MemoryMongo;
  let users: Model<UserRecord>;
  let grants: Model<NativeGrantRecord>;
  let credentials: Model<NativeCredentialRecord>;
  let service: NativeGrantsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    users = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    grants = memory.connection.model<NativeGrantRecord>(NativeGrantRecord.name);
    credentials = memory.connection.model<NativeCredentialRecord>(
      NativeCredentialRecord.name,
    );
    service = new NativeGrantsService(grants, credentials, new UsersService(users));
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      users.deleteMany({}),
      grants.deleteMany({}),
      credentials.deleteMany({}),
    ]);
  });

  async function person(status: 'active' | 'blocked' = 'active'): Promise<string> {
    const doc = await users.create({ name: 'Ученик', roles: [], status });
    return doc._id.toString();
  }

  async function codeOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof NativeAuthError) return error.code;
      throw error;
    }
    return 'ok';
  }

  async function issue(userId: string, now = T0): Promise<NativeTokenResponse> {
    return service.issueGrant(userId, now);
  }

  describe('выдача и хранение', () => {
    it('выдаёт bearer на 90 дней, renew_after 604801 и session_id доступа', async () => {
      const userId = await person();

      const response = await issue(userId);

      expect(response).toMatchObject({
        token_type: 'Bearer',
        expires_in: LIFETIME,
        scope: 'account:read',
        renew_after: THRESHOLD + 1,
      });
      expect(response.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(response.session_id).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
      const grant = await grants.findOne({ userId }).lean();
      expect(response.session_id).toBe(grant?._id.toString());
      expect(grant?.clientId).toBe('daychi-native');
      expect(grant?.revokedAt).toBeUndefined();
    });

    it('в базе только sha256 токена: сырой токен нигде не лежит', async () => {
      const userId = await person();
      const first = await issue(userId);
      const second = await issue(userId);

      const stored = await credentials.find({}).lean();
      const everything = JSON.stringify([stored, await grants.find({}).lean()]);

      expect(first.access_token).not.toBe(second.access_token);
      expect(stored.map((record) => record.tokenHash).sort()).toEqual(
        [sha256Hex(first.access_token), sha256Hex(second.access_token)].sort(),
      );
      expect(stored.every((record) => /^[0-9a-f]{64}$/.test(record.tokenHash))).toBe(
        true,
      );
      expect(everything).not.toContain(first.access_token);
      expect(everything).not.toContain(second.access_token);
    });

    it('даты в базе — целые секунды, даже если now с долями', async () => {
      const userId = await person();

      await issue(userId, T0.plus({ milliseconds: 750 }));

      const credential = await credentials.findOne({}).lean();
      expect(credential?.issuedAt.getTime()).toBe(T0.toMillis());
      expect(credential?.expiresAt.getTime()).toBe(
        T0.plus({ seconds: LIFETIME }).toMillis(),
      );
    });
  });

  describe('N08: срок и продление', () => {
    it('возраст 604800 — продления нет, тот же токен, renew_after 1', async () => {
      const response = await issue(await person());

      const renewed = await service.renew(response.access_token, at(THRESHOLD));

      expect(renewed.access_token).toBe(response.access_token);
      expect(renewed.renew_after).toBe(1);
      expect(renewed.expires_in).toBe(LIFETIME - THRESHOLD);
      expect(renewed.session_id).toBe(response.session_id);
      expect(await credentials.countDocuments()).toBe(1);
    });

    it('возраст 604801 — renew_after 0 до продления, затем новый токен того же доступа', async () => {
      const response = await issue(await person());
      const now = at(THRESHOLD + 1);
      const { credential } = await service.authenticate(response.access_token, now);

      expect(service.sessionView(credential, now).renew_after).toBe(0);
      const renewed = await service.renew(response.access_token, now);

      expect(renewed.access_token).not.toBe(response.access_token);
      expect(renewed.session_id).toBe(response.session_id);
      expect(renewed.expires_in).toBe(LIFETIME);
      expect(renewed.renew_after).toBe(THRESHOLD + 1);
      expect(await grants.countDocuments()).toBe(1);
      expect(await credentials.countDocuments()).toBe(2);
    });

    it('за секунду до срока токен живой, в секунду срока — invalid_token', async () => {
      const response = await issue(await person());

      const last = await service.authenticate(response.access_token, at(LIFETIME - 1));
      const expired = codeOf(service.authenticate(response.access_token, at(LIFETIME)));

      expect(service.sessionView(last.credential, at(LIFETIME - 1)).expires_in).toBe(1);
      expect(await expired).toBe('invalid_token');
      expect(await codeOf(service.renew(response.access_token, at(LIFETIME)))).toBe(
        'invalid_token',
      );
    });

    it('срок нового токена считается от его выдачи, срок доступа догоняет его', async () => {
      const response = await issue(await person());
      const renewAt = at(THRESHOLD + 1);

      await service.renew(response.access_token, renewAt);

      const grant = await grants.findOne({}).lean();
      expect(grant?.purgeAt.getTime()).toBe(
        renewAt.plus({ seconds: LIFETIME }).toMillis(),
      );
    });

    it('срок доступа не сдвигается назад, если продление пришло с меньшим now', async () => {
      const response = await issue(await person());
      const later = await service.renew(response.access_token, at(THRESHOLD + 100));

      await service.renew(response.access_token, at(THRESHOLD + 1));

      const grant = await grants.findOne({}).lean();
      expect(later.session_id).toBe(response.session_id);
      expect(grant?.purgeAt.getTime()).toBe(at(THRESHOLD + 100 + LIFETIME).toMillis());
    });
  });

  describe('N09: прежний токен после продления', () => {
    it('предшественник проходит проверку и может продлить ещё раз', async () => {
      const response = await issue(await person());
      const now = at(THRESHOLD + 1);
      const renewed = await service.renew(response.access_token, now);

      const oldStillWorks = await service.authenticate(response.access_token, now);
      const retried = await service.renew(
        response.access_token,
        now.plus({ seconds: 5 }),
      );

      expect(oldStillWorks.grant._id.toString()).toBe(response.session_id);
      expect(retried.session_id).toBe(response.session_id);
      expect(retried.access_token).not.toBe(renewed.access_token);
      expect(await service.authenticate(renewed.access_token, now)).toBeDefined();
    });

    it('предшественник живёт до собственного срока, не до срока преемника', async () => {
      const response = await issue(await person());
      const renewed = await service.renew(response.access_token, at(THRESHOLD + 1));

      expect(
        await codeOf(service.authenticate(response.access_token, at(LIFETIME))),
      ).toBe('invalid_token');
      expect(await codeOf(service.authenticate(renewed.access_token, at(LIFETIME)))).toBe(
        'ok',
      );
    });
  });

  describe('N11: отзыв гасит весь доступ, чужой не трогает', () => {
    it('отзыв по СТАРОМУ токену гасит оба токена доступа А, доступ Б жив', async () => {
      const userId = await person();
      const a = await issue(userId);
      const b = await issue(userId);
      const now = at(THRESHOLD + 1);
      const renewedA = await service.renew(a.access_token, now);

      await service.revoke(a.access_token, now);

      expect(await codeOf(service.authenticate(a.access_token, now))).toBe(
        'invalid_token',
      );
      expect(await codeOf(service.authenticate(renewedA.access_token, now))).toBe(
        'invalid_token',
      );
      expect(await codeOf(service.renew(renewedA.access_token, now))).toBe(
        'invalid_token',
      );
      expect(await codeOf(service.authenticate(b.access_token, now))).toBe('ok');
    });
  });

  describe('N12: отзыв и продление одновременно, повтор и мусор', () => {
    it('после ответа revoke ни один токен доступа не проходит, как бы ни легли гонки', async () => {
      const userId = await person();
      const now = at(THRESHOLD + 1);

      for (let round = 0; round < 15; round++) {
        const response = await issue(userId);
        const [revoked, ...renewals] = await Promise.allSettled([
          service.revoke(response.access_token, now),
          service.renew(response.access_token, now).then((r) => r.access_token),
          service.renew(response.access_token, now).then((r) => r.access_token),
        ]);

        const issued = renewals.flatMap((result) =>
          result.status === 'fulfilled' ? [String(result.value)] : [],
        );
        const tokens = [response.access_token, ...issued];
        expect(revoked?.status).toBe('fulfilled');
        for (const token of tokens) {
          expect(await codeOf(service.authenticate(token, now))).toBe('invalid_token');
        }
      }
    });

    it('повторный отзыв, чужой формат, неизвестный токен и пустая строка — без ошибок', async () => {
      const response = await issue(await person());

      await service.revoke(response.access_token, T0);
      await service.revoke(response.access_token, T0);
      await service.revoke('x'.repeat(43), T0);
      await service.revoke('не токен', T0);
      await service.revoke('', T0);

      const grant = await grants.findOne({}).lean();
      expect(grant?.revokedAt?.getTime()).toBe(T0.toMillis());
    });

    it('повторный отзыв не переписывает момент первого', async () => {
      const response = await issue(await person());

      await service.revoke(response.access_token, at(10));
      await service.revoke(response.access_token, at(99));

      const grant = await grants.findOne({}).lean();
      expect(grant?.revokedAt?.getTime()).toBe(at(10).toMillis());
    });

    it('истёкший токен, запись которого ещё в базе, отзывает свой доступ', async () => {
      const userId = await person();
      const response = await issue(userId);
      const renewed = await service.renew(response.access_token, at(THRESHOLD + 1));

      await service.revoke(response.access_token, at(LIFETIME + 1));

      expect(
        await codeOf(service.authenticate(renewed.access_token, at(LIFETIME + 2))),
      ).toBe('invalid_token');
      const grant = await grants.findOne({}).lean();
      expect(grant?.revokedAt).toBeDefined();
    });
  });

  describe('N13: аккаунт', () => {
    it('заблокированный — account_blocked, после разблокировки тот же токен снова работает', async () => {
      const userId = await person();
      const response = await issue(userId);

      await users.updateOne({ _id: userId }, { status: 'blocked' });
      const blocked = await codeOf(service.authenticate(response.access_token, T0));
      const blockedRenew = await codeOf(service.renew(response.access_token, T0));
      await users.updateOne({ _id: userId }, { status: 'active' });

      expect(blocked).toBe('account_blocked');
      expect(blockedRenew).toBe('account_blocked');
      expect(await codeOf(service.authenticate(response.access_token, T0))).toBe('ok');
    });

    it('удалённый человек — invalid_token', async () => {
      const userId = await person();
      const response = await issue(userId);

      await users.deleteOne({ _id: userId });

      expect(await codeOf(service.authenticate(response.access_token, T0))).toBe(
        'invalid_token',
      );
    });

    it('негодный bearer при заблокированном человеке не раскрывает блокировку', async () => {
      const userId = await person('blocked');
      const response = await issue(userId);

      const garbage = await codeOf(service.authenticate('y'.repeat(43), T0));
      const expired = await codeOf(
        service.authenticate(response.access_token, at(LIFETIME)),
      );
      await service.revoke(response.access_token, T0);
      const revoked = await codeOf(service.authenticate(response.access_token, T0));

      expect([garbage, expired, revoked]).toEqual([
        'invalid_token',
        'invalid_token',
        'invalid_token',
      ]);
    });

    it('токен не из нашего формата отвергается до обращения к базе', async () => {
      expect(await codeOf(service.authenticate('', T0))).toBe('invalid_token');
      expect(await codeOf(service.authenticate('session.jwt.value', T0))).toBe(
        'invalid_token',
      );
    });
  });
});
