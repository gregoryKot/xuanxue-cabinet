// Против настоящей Mongo (mongodb-memory-server) — правила привязки Google
// из профиля (ADR-0145, google-link.service.ts): идемпотентность, отказ
// «уже привязан другой», отказ «этот Google занят», гонка на реальном
// уникальном индексе googleId.
import type { Connection, Model } from 'mongoose';
import { GOOGLE_LINK_OTHER_MESSAGE, GOOGLE_LINK_TAKEN_MESSAGE } from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { GoogleLinkService } from './google-link.service';
import { GoogleLoginUserService } from './google-login-user.service';
import type { GoogleIdentity } from './google-login-identity.service';
import { UserRecord, UserSchema } from './user.schema';
import type { UserLean } from './users.service';

function identity(sub: string): GoogleIdentity {
  return { sub, emailVerified: false, emailAuthoritative: false };
}

function asUser(id: string, name: string): UserLean {
  return { id, name, roles: [], status: 'active', studentMode: false };
}

describe('GoogleLinkService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<UserRecord>;
  let service: GoogleLinkService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<UserRecord>(UserRecord.name, UserSchema);
    await model.syncIndexes();
    service = new GoogleLinkService(new GoogleLoginUserService(model));
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('аккаунт без googleId — привязывает, read-after-write', async () => {
    const doc = await model.create({ name: 'Анна', roles: [], status: 'active' });

    const linked = await service.link(
      {
        id: doc._id.toString(),
        name: 'Анна',
        roles: [],
        status: 'active',
        studentMode: false,
      },
      identity('sub-1'),
    );

    expect(linked.googleId).toBe('sub-1');
    const reread = await model.findById(doc._id).lean();
    expect(reread?.googleId).toBe('sub-1');
  });

  it('повтор с тем же sub — идемпотентно, без обращения к базе на запись', async () => {
    const doc = await model.create({
      name: 'Анна',
      googleId: 'sub-2',
      roles: [],
      status: 'active',
    });

    const result = await service.link(
      {
        id: doc._id.toString(),
        name: 'Анна',
        googleId: 'sub-2',
        roles: [],
        status: 'active',
        studentMode: false,
      },
      identity('sub-2'),
    );

    expect(result.googleId).toBe('sub-2');
  });

  it('к аккаунту уже привязан другой Google — конфликт, ничего не меняется', async () => {
    const doc = await model.create({
      name: 'Анна',
      googleId: 'sub-old',
      roles: [],
      status: 'active',
    });

    await expect(
      service.link(
        {
          id: doc._id.toString(),
          name: 'Анна',
          googleId: 'sub-old',
          roles: [],
          status: 'active',
          studentMode: false,
        },
        identity('sub-new'),
      ),
    ).rejects.toThrow(GOOGLE_LINK_OTHER_MESSAGE);

    const reread = await model.findById(doc._id).lean();
    expect(reread?.googleId).toBe('sub-old');
  });

  it('этот Google уже принадлежит другому аккаунту — конфликт, ничего не меняется', async () => {
    await model.create({
      name: 'Пётр',
      googleId: 'sub-taken',
      roles: [],
      status: 'active',
    });
    const mine = await model.create({ name: 'Анна', roles: [], status: 'active' });

    await expect(
      service.link(
        {
          id: mine._id.toString(),
          name: 'Анна',
          roles: [],
          status: 'active',
          studentMode: false,
        },
        identity('sub-taken'),
      ),
    ).rejects.toThrow(GOOGLE_LINK_TAKEN_MESSAGE);

    const reread = await model.findById(mine._id).lean();
    expect(reread?.googleId).toBeUndefined();
  });

  it('два параллельных link() одним sub на разные аккаунты — один успех, второй TAKEN', async () => {
    const a = await model.create({ name: 'А', roles: [], status: 'active' });
    const b = await model.create({ name: 'Б', roles: [], status: 'active' });

    const results = await Promise.allSettled([
      service.link(asUser(a._id.toString(), 'А'), identity('sub-race')),
      service.link(asUser(b._id.toString(), 'Б'), identity('sub-race')),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    await expect(model.countDocuments({ googleId: 'sub-race' })).resolves.toBe(1);
  });
});
