// Против настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»): атомарность
// завершения и обмена держит фильтр `findOneAndUpdate`, мок её не проверил бы.
// Время — явный `now`. T0 — от настоящих часов: TTL-индекс по `purgeAt` живёт по
// часам сервера базы, и срок из прошлого стёр бы запись посреди теста.
// Случаи N02, N06, N07 и попытки из браузера — «Common conformance cases»
// профиля Workshop 3c98d4a.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  NATIVE_CLIENT_ID,
  NATIVE_REDIRECT_URI,
  NATIVE_SCOPE,
  type NativeTokenInput,
} from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { NativeAuthError } from './native-auth-error';
import { NativeAuthorizationRecord } from './native-authorization.schema';
import { NativeAuthorizationsService } from './native-authorizations.service';
import { NativeCredentialRecord } from './native-credential.schema';
import { NativeGrantRecord } from './native-grant.schema';
import { NativeGrantsService } from './native-grants.service';
import { s256Challenge, sha256Hex } from './native-secrets';

const T0 = DateTime.utc().startOf('second');
// RFC 7636, приложение B — пара verifier/challenge из профиля (N02).
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const BINDING = sha256Hex('b'.repeat(43));
const ISSUER = 'https://staging.xuanxue.su';

function at(seconds: number): DateTime {
  return T0.plus({ seconds });
}

describe('NativeAuthorizationsService (Mongo)', () => {
  let memory: MemoryMongo;
  let users: Model<UserRecord>;
  let attempts: Model<NativeAuthorizationRecord>;
  let grants: Model<NativeGrantRecord>;
  let service: NativeAuthorizationsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    users = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    attempts = memory.connection.model<NativeAuthorizationRecord>(
      NativeAuthorizationRecord.name,
    );
    grants = memory.connection.model<NativeGrantRecord>(NativeGrantRecord.name);
    const credentials = memory.connection.model<NativeCredentialRecord>(
      NativeCredentialRecord.name,
    );
    const usersService = new UsersService(users);
    service = new NativeAuthorizationsService(
      attempts,
      usersService,
      new NativeGrantsService(grants, credentials, usersService),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      users.deleteMany({}),
      attempts.deleteMany({}),
      grants.deleteMany({}),
    ]);
  });

  async function person(): Promise<string> {
    const doc = await users.create({ name: 'Ученик', roles: [], status: 'active' });
    return doc._id.toString();
  }

  function begin(now = T0, challenge = RFC_CHALLENGE): Promise<string> {
    return service.create(
      {
        issuer: ISSUER,
        clientId: NATIVE_CLIENT_ID,
        redirectUri: NATIVE_REDIRECT_URI,
        scope: NATIVE_SCOPE,
        state: 's'.repeat(43),
        codeChallenge: challenge,
      },
      BINDING,
      now,
    );
  }

  async function codeFor(userId: string, now = T0): Promise<string> {
    const done = await service.complete(await begin(now), BINDING, { userId }, now);
    if (!done?.code) throw new Error('попытка не выдала код');
    return done.code;
  }

  function form(code: string, verifier = RFC_VERIFIER): NativeTokenInput {
    return {
      grant_type: 'authorization_code',
      client_id: NATIVE_CLIENT_ID,
      redirect_uri: NATIVE_REDIRECT_URI,
      code,
      code_verifier: verifier,
    };
  }

  async function outcomeOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof NativeAuthError) return error.code;
      throw error;
    }
    return 'ok';
  }

  describe('попытка', () => {
    it('хранит параметры, хеш привязки и сроки в целых секундах', async () => {
      const id = await begin(T0.plus({ milliseconds: 600 }));

      const stored = await attempts.findById(id).lean();
      expect(stored).toMatchObject({
        issuer: ISSUER,
        state: 's'.repeat(43),
        codeChallenge: RFC_CHALLENGE,
        bindingHash: BINDING,
      });
      expect(stored?.expiresAt.getTime()).toBe(at(900).toMillis());
      expect(stored?.purgeAt.getTime()).toBe(at(960).toMillis());
    });

    it('+899 завершается, +900 — уже нет', async () => {
      const userId = await person();
      const late = await begin();

      const inTime = await service.complete(await begin(), BINDING, { userId }, at(899));
      const expired = await service.complete(late, BINDING, { userId }, at(900));

      expect(inTime?.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(inTime).toMatchObject({ issuer: ISSUER, redirectUri: NATIVE_REDIRECT_URI });
      expect(expired).toBeNull();
      expect(await service.findPending(late, BINDING, at(900))).toBeNull();
    });

    it('чужая привязка, повтор завершения и битый номер — null, код не выдан', async () => {
      const userId = await person();
      const id = await begin();

      const foreign = await service.complete(
        id,
        sha256Hex('x'.repeat(43)),
        { userId },
        T0,
      );
      const first = await service.complete(id, BINDING, { userId }, T0);
      const replay = await service.complete(id, BINDING, { userId }, T0);

      expect(foreign).toBeNull();
      expect(first?.code).toBeDefined();
      expect(replay).toBeNull();
      expect(await service.complete('not-an-id', BINDING, { userId }, T0)).toBeNull();
      expect(await service.findPending('f'.repeat(24), BINDING, T0)).toBeNull();
    });

    it('номер попытки не ObjectId — findPending отвечает null без запроса', async () => {
      const id = await begin();

      expect(await service.findPending(`${id}x`, BINDING, T0)).toBeNull();
      expect(await service.findPending(id, BINDING, T0)).toEqual({
        issuer: ISSUER,
        redirectUri: NATIVE_REDIRECT_URI,
        state: 's'.repeat(43),
      });
    });

    it('два одновременных завершения — не больше одного кода', async () => {
      const userId = await person();

      for (let round = 0; round < 10; round++) {
        const id = await begin();
        const results = await Promise.all([
          service.complete(id, BINDING, { userId }, T0),
          service.complete(id, BINDING, { userId }, T0),
          service.complete(id, BINDING, { denied: true }, T0),
        ]);

        expect(results.filter((result) => result !== null)).toHaveLength(1);
      }
    });

    it('отказ завершает попытку без кода: ни хеша, ни человека в записи', async () => {
      const id = await begin();

      const denied = await service.complete(id, BINDING, { denied: true }, T0);

      expect(denied).toEqual({
        issuer: ISSUER,
        redirectUri: NATIVE_REDIRECT_URI,
        state: 's'.repeat(43),
        code: undefined,
      });
      const stored = await attempts.findById(id).lean();
      expect(stored?.completedAt?.getTime()).toBe(T0.toMillis());
      expect(stored?.codeHash).toBeUndefined();
      expect(stored?.userId).toBeUndefined();
    });

    it('в базе только sha256 кода', async () => {
      const code = await codeFor(await person());

      const stored = await attempts.findOne({}).lean();
      expect(stored?.codeHash).toBe(sha256Hex(code));
      expect(JSON.stringify(stored)).not.toContain(code);
    });
  });

  describe('N02: PKCE S256', () => {
    it('вектор RFC 7636 даёт challenge из профиля', () => {
      expect(s256Challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    });

    it('неверный verifier отказывает и код не тратит — верный следом проходит', async () => {
      const code = await codeFor(await person());

      const wrong = await outcomeOf(service.exchange(form(code, 'w'.repeat(43)), T0));
      const right = await service.exchange(form(code), T0);

      expect(wrong).toBe('invalid_grant');
      expect(right.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(right.session_id).toBe((await grants.findOne({}).lean())?._id.toString());
    });

    it('чужой redirect URI в обмене — invalid_grant, код цел', async () => {
      const code = await codeFor(await person());

      const altered = { ...form(code), redirect_uri: `${NATIVE_REDIRECT_URI}/` };

      expect(await outcomeOf(service.exchange(altered, T0))).toBe('invalid_grant');
      expect(await outcomeOf(service.exchange(form(code), T0))).toBe('ok');
    });
  });

  describe('N06: срок, повтор, гонка', () => {
    it('+59 — обмен проходит, +60 — invalid_grant', async () => {
      const userId = await person();
      const fresh = await codeFor(userId);
      const stale = await codeFor(userId);

      expect(await outcomeOf(service.exchange(form(fresh), at(59)))).toBe('ok');
      expect(await outcomeOf(service.exchange(form(stale), at(60)))).toBe(
        'invalid_grant',
      );
    });

    it('повтор кода — invalid_grant, второго доступа нет', async () => {
      const code = await codeFor(await person());

      await service.exchange(form(code), T0);
      const replay = await outcomeOf(service.exchange(form(code), T0));

      expect(replay).toBe('invalid_grant');
      expect(await grants.countDocuments()).toBe(1);
    });

    it('два одновременных обмена — ровно один успех', async () => {
      const userId = await person();

      for (let round = 0; round < 10; round++) {
        const code = await codeFor(userId);
        const results = await Promise.all([
          outcomeOf(service.exchange(form(code), T0)),
          outcomeOf(service.exchange(form(code), T0)),
        ]);

        expect(results.sort()).toEqual(['invalid_grant', 'ok']);
      }
    });
  });

  describe('N07: человек между кодом и обменом', () => {
    it.each([
      [
        'заблокирован',
        (id: string) => users.updateOne({ _id: id }, { status: 'blocked' }),
      ],
      ['удалён', (id: string) => users.deleteOne({ _id: id })],
    ])('%s — invalid_grant, доступ не создан, код потрачен', async (_name, change) => {
      const userId = await person();
      const code = await codeFor(userId);

      await change(userId);
      const refused = await outcomeOf(service.exchange(form(code), T0));
      await users.updateOne({ _id: userId }, { status: 'active' });

      expect(refused).toBe('invalid_grant');
      expect(await grants.countDocuments()).toBe(0);
      expect(await outcomeOf(service.exchange(form(code), T0))).toBe('invalid_grant');
    });
  });

  describe('порядок ошибок обмена', () => {
    it('тип гранта, затем клиент, затем формат, затем сам код', async () => {
      const code = await codeFor(await person());
      const bad = { ...form(code), code: 'short' };

      expect(
        await outcomeOf(
          service.exchange({ ...bad, grant_type: 'password', client_id: 'x' }, T0),
        ),
      ).toBe('unsupported_grant_type');
      expect(await outcomeOf(service.exchange({ ...bad, client_id: 'x' }, T0))).toBe(
        'invalid_client',
      );
      expect(await outcomeOf(service.exchange(bad, T0))).toBe('invalid_request');
      expect(
        await outcomeOf(service.exchange({ ...form(code), code_verifier: 'v' }, T0)),
      ).toBe('invalid_request');
      expect(await outcomeOf(service.exchange(form('u'.repeat(43)), T0))).toBe(
        'invalid_grant',
      );
      expect(await outcomeOf(service.exchange(form(code), T0))).toBe('ok');
    });
  });
});
