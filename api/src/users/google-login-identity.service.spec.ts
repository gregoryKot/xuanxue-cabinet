// Против настоящей Mongo (mongodb-memory-server) — правила связки Google по
// email целиком (ADR-0145, google-login-identity.service.ts): каждое правило
// из комментария-шапки того файла отдельным тестом, плюс read-after-write и
// настоящая гонка двух параллельных входов на общий email.
import type { Connection, Model } from 'mongoose';
import {
  ACCESS_MESSAGE,
  GOOGLE_EMAIL_NEEDS_EMAIL_LOGIN_MESSAGE,
  GOOGLE_OTHER_ACCOUNT_MESSAGE,
  NEW_PERSON_NAME,
  NO_INVITE_LINK_MESSAGE,
} from '@xuanxue/shared';
import { DateTime } from 'luxon';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { EmailLoginUserService } from './email-login-user.service';
import { GoogleLoginIdentityService } from './google-login-identity.service';
import type { GoogleIdentity } from './google-login-identity.service';
import { GoogleLoginUserService } from './google-login-user.service';
import type { InviteLinkService } from './invite-link.service';
import { UserRecord, UserSchema } from './user.schema';
import { UsersService } from './users.service';

const NOW = DateTime.fromISO('2026-09-28T10:00:00Z');
const VALID_CODE = 'a'.repeat(32);

function identity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return {
    sub: 'sub-default',
    email: 'anna@gmail.com',
    emailVerified: true,
    emailAuthoritative: true,
    givenName: 'Анна',
    familyName: 'Петрова',
    ...overrides,
  };
}

function fakeInvites(): InviteLinkService {
  return {
    isValid: (code: string) => Promise.resolve(code === VALID_CODE),
  } as unknown as InviteLinkService;
}

describe('GoogleLoginIdentityService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: GoogleLoginIdentityService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    await model.syncIndexes();
    service = new GoogleLoginIdentityService(
      new GoogleLoginUserService(model),
      new EmailLoginUserService(model),
      fakeInvites(),
      new UsersService(model),
    );
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  describe('правило 1 — googleId === sub', () => {
    it('уже привязанный аккаунт — возвращается сразу, email не перечитывается', async () => {
      const doc = await model.create({
        name: 'Анна',
        email: 'old@gmail.com',
        googleId: 'sub-1',
        roles: [],
        status: 'active',
      });

      // Google на этот раз отдаёт другой email — sub единственный ключ,
      // адрес в базе не трогается вовсе (см. комментарий-шапку файла).
      const user = await service.resolveGoogleUser(
        identity({ sub: 'sub-1', email: 'new@gmail.com' }),
        undefined,
        NOW,
      );

      expect(user.id).toBe(doc._id.toString());
      const reread = await model.findById(doc._id).lean();
      expect(reread?.email).toBe('old@gmail.com');
    });
  });

  describe('правило 2 — связка по подтверждённому email', () => {
    it('email authoritative, аккаунт без googleId — привязывается, вход проходит', async () => {
      const doc = await model.create({
        name: 'Анна',
        email: 'anna@gmail.com',
        roles: ['teacher'],
        status: 'active',
      });

      const user = await service.resolveGoogleUser(
        identity({ sub: 'sub-2', email: 'anna@gmail.com' }),
        undefined,
        NOW,
      );

      expect(user.id).toBe(doc._id.toString());
      const reread = await model.findById(doc._id).lean();
      expect(reread?.googleId).toBe('sub-2');

      // read-after-write: второй вход тем же sub находит уже привязанный аккаунт.
      const again = await service.resolveGoogleUser(
        identity({ sub: 'sub-2', email: 'anna@gmail.com' }),
        undefined,
        NOW,
      );
      expect(again.id).toBe(doc._id.toString());
    });

    it('email подтверждён Google, но не authoritative (не Gmail/Workspace) — конфликт, ничего не пишется', async () => {
      await model.create({ name: 'Анна', email: 'anna@example.com', roles: [] });

      await expect(
        service.resolveGoogleUser(
          identity({
            sub: 'sub-3',
            email: 'anna@example.com',
            emailAuthoritative: false,
          }),
          undefined,
          NOW,
        ),
      ).rejects.toThrow(GOOGLE_EMAIL_NEEDS_EMAIL_LOGIN_MESSAGE);

      await expect(model.exists({ googleId: 'sub-3' })).resolves.toBeNull();
    });

    it('аккаунт с этим email заблокирован — ForbiddenError, googleId не пишется', async () => {
      const doc = await model.create({
        name: 'Анна',
        email: 'blocked@gmail.com',
        roles: [],
        status: 'blocked',
      });

      await expect(
        service.resolveGoogleUser(
          identity({ sub: 'sub-4', email: 'blocked@gmail.com' }),
          undefined,
          NOW,
        ),
      ).rejects.toThrow(ACCESS_MESSAGE);

      const reread = await model.findById(doc._id).lean();
      expect(reread?.googleId).toBeUndefined();
    });

    it('email уже занят другим googleId — конфликт', async () => {
      await model.create({
        name: 'Анна',
        email: 'anna2@gmail.com',
        googleId: 'sub-old',
        roles: [],
      });

      await expect(
        service.resolveGoogleUser(
          identity({ sub: 'sub-new', email: 'anna2@gmail.com' }),
          undefined,
          NOW,
        ),
      ).rejects.toThrow(GOOGLE_OTHER_ACCOUNT_MESSAGE);
    });

    it('email только pendingEmail (не подтверждён) — не находится, уходит в правило 3', async () => {
      await model.create({
        name: 'Новый ученик',
        pendingEmail: 'anna3@gmail.com',
        roles: [],
      });

      await expect(
        service.resolveGoogleUser(
          identity({ sub: 'sub-5', email: 'anna3@gmail.com' }),
          undefined,
          NOW,
        ),
      ).rejects.toThrow(NO_INVITE_LINK_MESSAGE);
    });

    it('invite игнорируется для существующего человека', async () => {
      const doc = await model.create({
        name: 'Анна',
        email: 'anna4@gmail.com',
        roles: [],
      });

      const user = await service.resolveGoogleUser(
        identity({ sub: 'sub-6', email: 'anna4@gmail.com' }),
        'невалидный-код-не-важно',
        NOW,
      );

      expect(user.id).toBe(doc._id.toString());
    });

    it('два параллельных входа одним новым sub на общий email — оба успешны, один пользователь', async () => {
      await model.create({ name: 'Анна', email: 'race@gmail.com', roles: [] });

      const [first, second] = await Promise.all([
        service.resolveGoogleUser(
          identity({ sub: 'sub-race', email: 'race@gmail.com' }),
          undefined,
          NOW,
        ),
        service.resolveGoogleUser(
          identity({ sub: 'sub-race', email: 'race@gmail.com' }),
          undefined,
          NOW,
        ),
      ]);

      expect(first.id).toBe(second.id);
      await expect(model.countDocuments({ email: 'race@gmail.com' })).resolves.toBe(1);
    });
  });

  describe('правило 3 — новый человек', () => {
    it('без валидного приглашения — ForbiddenError, аккаунт не создаётся', async () => {
      await expect(
        service.resolveGoogleUser(
          identity({ sub: 'sub-7', email: undefined }),
          undefined,
          NOW,
        ),
      ).rejects.toThrow(NO_INVITE_LINK_MESSAGE);

      await expect(model.exists({ googleId: 'sub-7' })).resolves.toBeNull();
    });

    it('с валидным приглашением — создаётся active, roles: [], имя из givenName+familyName, email (authoritative)', async () => {
      const user = await service.resolveGoogleUser(
        identity({ sub: 'sub-8', email: 'new@gmail.com' }),
        VALID_CODE,
        NOW,
      );

      expect(user).toMatchObject({
        googleId: 'sub-8',
        name: 'Анна Петрова',
        roles: [],
        status: 'active',
        email: 'new@gmail.com',
      });
      expect(user.joinedViaInviteAt).toEqual(NOW.toJSDate());
    });

    it('email не authoritative — новый человек заводится без email вовсе', async () => {
      const user = await service.resolveGoogleUser(
        identity({
          sub: 'sub-9',
          email: 'someone@example.com',
          emailAuthoritative: false,
        }),
        VALID_CODE,
        NOW,
      );

      expect(user.email).toBeUndefined();
    });

    it('без имени и фамилии — заглушка NEW_PERSON_NAME', async () => {
      const user = await service.resolveGoogleUser(
        identity({
          sub: 'sub-10',
          email: undefined,
          emailVerified: false,
          emailAuthoritative: false,
          givenName: undefined,
          familyName: undefined,
          name: undefined,
        }),
        VALID_CODE,
        NOW,
      );

      expect(user.name).toBe(NEW_PERSON_NAME);
    });

    it('Telegram-only человек (тот же email отсутствует у него) не находится — заводится вторым аккаунтом', async () => {
      await model.create({ name: 'Дима', telegramId: 1, roles: [] });

      const user = await service.resolveGoogleUser(
        identity({ sub: 'sub-11', email: undefined }),
        VALID_CODE,
        NOW,
      );

      expect(user.googleId).toBe('sub-11');
      await expect(model.countDocuments({})).resolves.toBe(2);
    });
  });
});
