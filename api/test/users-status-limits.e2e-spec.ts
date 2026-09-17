// Ограничения PATCH /users/:id/status (SECURITY §2, симметрично
// updateRoles/deleteAllUserData): нельзя закрыть себе доступ, нельзя закрыть
// последнему активному администратору школы. Отдельный файл от
// users-status.e2e-spec.ts — там матрица доступа, здесь ограничения, чтобы
// ни один не упёрся в потолок file-size-ratchet.
import type { ApiErrorBody } from '@xuanxue/shared';
import { SELF_BLOCK_MESSAGE } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { createUsersTestHelpers } from './e2e-support/users-fixtures';

describe('Users status limits (e2e)', () => {
  let testApp: TestApp;
  const { userModel, patchStatus } = createUsersTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await userModel().deleteMany({});
  });

  it('закрыть доступ себе — 403 с SELF_BLOCK_MESSAGE', async () => {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Маша',
      roles: ['admin'],
    });
    // Второй активный админ — иначе сработала бы проверка «последний
    // активный админ» раньше проверки самоблокировки (порядок проверок —
    // user-status.service.ts), и текст ошибки был бы не тот, что тестируем.
    await createUserWithSession(testApp.app, { name: 'Второй админ', roles: ['admin'] });

    const res = await patchStatus(cookie, userId, { status: 'blocked' });

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(SELF_BLOCK_MESSAGE);
  });

  // «Последний активный администратор» (LAST_ADMIN_BLOCK_MESSAGE) не
  // проверяется здесь отдельным HTTP-кейсом — тот же приём, что и у
  // updateRoles в users.e2e-spec.ts: чтобы вызвать PATCH .../status, нужен
  // свой admin-cookie, и вызывающий сам остаётся активным админом после
  // чужой блокировки. Единственный способ довести число активных админов до
  // нуля одним запросом — закрыть доступ себе, а это перехватывает более
  // ранняя и более точная по тексту проверка самоблокировки выше. Ветка
  // покрыта отдельно в user-status.service.spec.ts (юнит на
  // mongodb-memory-server, currentUserId там не привязан к реальной сессии).

  it('закрыть доступ не-последнему активному админу — 200 (второй остаётся)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ 1',
      roles: ['admin'],
    });
    const { userId: secondId } = await createUserWithSession(testApp.app, {
      name: 'Админ 2',
      roles: ['admin'],
    });

    const res = await patchStatus(cookie, secondId, { status: 'blocked' });

    expect(res.status).toBe(200);
  });
});
