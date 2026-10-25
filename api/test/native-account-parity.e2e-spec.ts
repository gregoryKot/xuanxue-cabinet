// N01 (ADR-0181): `account` в GET /api/auth/native/me — тот же MeDto, что у
// GET /api/auth/me по cookie, байт в байт, для людей всех форм. Расхождение
// значило бы, что Daychi показывает человеку не тот аккаунт, что кабинет.
// Поля пишутся мимо сервисов, прямым обновлением коллекции: тест держит
// именно разбор документа, а не пути, которыми поля обычно появляются.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { DateTime } from 'luxon';
import type { MeDto, NativeAccountResponse, UserRole } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { NATIVE_BASE, bearer, issueNativeGrant } from './e2e-support/native-fixtures';
import { createUserWithSession } from './e2e-support/session';

interface Shape {
  name: string;
  roles?: UserRole[];
  email?: string;
  telegramId?: number;
  /** Сырые поля документа, которых нет в `createUserWithSession`. */
  raw?: Record<string, unknown>;
  botChat?: boolean;
}

describe('N01: account нативного me совпадает с GET /auth/me (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function bothViews(shape: Shape): Promise<{ web: MeDto; native: MeDto }> {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: shape.name,
      roles: shape.roles ?? [],
      email: shape.email,
      telegramId: shape.telegramId,
    });
    if (shape.raw) {
      const users = testApp.app.get<Model<UserRecord>>(getModelToken(USER_MODEL_NAME), {
        strict: false,
      });
      await users.collection.updateOne(
        { _id: new Types.ObjectId(userId) },
        { $set: shape.raw },
      );
    }
    if (shape.botChat && shape.telegramId !== undefined) {
      await testApp.app
        .get<Model<ChannelRecord>>(getModelToken(ChannelRecord.name), { strict: false })
        .create({
          type: 'telegram',
          title: 'x',
          config: '{}',
          target: String(shape.telegramId),
          active: true,
        });
    }
    const { access_token: token } = await issueNativeGrant(testApp.app, userId);

    const web = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    const native = await request(server())
      .get(`${NATIVE_BASE}/me`)
      .set('Authorization', bearer(token));
    expect(web.status).toBe(200);
    expect(native.status).toBe(200);
    return {
      web: web.body as MeDto,
      native: (native.body as NativeAccountResponse).account,
    };
  }

  const PROFILE_NAMED = DateTime.utc().toJSDate();

  it.each<[string, Shape, Partial<MeDto>]>([
    [
      'ученик с почтой',
      { name: 'Мария', email: 'maria@example.com' },
      { hasEmail: true },
    ],
    ['ученик без почты', { name: 'Борис' }, { hasEmail: false, needsProfile: true }],
    [
      'смена почты ждёт подтверждения',
      {
        name: 'Вера',
        email: 'vera@example.com',
        raw: { pendingEmail: 'new@example.com' },
      },
      { pendingEmail: 'new@example.com' },
    ],
    [
      'учитель',
      { name: 'Дима', roles: ['teacher'], raw: { profileNamedAt: PROFILE_NAMED } },
      { roles: ['teacher'], canUseStudentMode: true, needsProfile: false },
    ],
    [
      'учитель в режиме ученика: роли скрыты',
      { name: 'Дима', roles: ['teacher'], raw: { studentModeAt: PROFILE_NAMED } },
      { roles: [], studentMode: true, canUseStudentMode: true },
    ],
    [
      'Telegram и Google, без чата бота',
      { name: 'Лена', telegramId: 800_101, raw: { googleId: 'g-800101' } },
      { telegramLinked: true, googleLinked: true, botChatActive: false },
    ],
    [
      'личный чат бота активен',
      { name: 'Олег', telegramId: 800_102, botChat: true },
      { telegramLinked: true, botChatActive: true },
    ],
    [
      'отметка «у меня нет Telegram»',
      { name: 'Инна', raw: { noTelegramAt: PROFILE_NAMED } },
      { noTelegram: true },
    ],
    ['плитки не скрывались', { name: 'Яна' }, { homeHiddenTiles: [] }],
    [
      'одна скрытая плитка',
      { name: 'Артём', raw: { homeHiddenTiles: ['notice'] } },
      { homeHiddenTiles: ['notice'] },
    ],
    [
      'в базе дубли и чужие ключи — отдаётся нормализованный список',
      { name: 'Зоя', raw: { homeHiddenTiles: ['events', 'payment', 'events', 'gone'] } },
      { homeHiddenTiles: ['payment', 'events'] },
    ],
  ])('%s', async (_name, shape, expected) => {
    const { web, native } = await bothViews(shape);

    expect(native).toEqual(web);
    expect(native).toMatchObject(expected);
  });
});
