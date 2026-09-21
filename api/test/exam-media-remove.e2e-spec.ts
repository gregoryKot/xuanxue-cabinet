// e2e — DELETE /attempts/:id/media/:mediaId (ADR-0086): чужую запись не
// снять (SECURITY §3, тот же 404, что у прочих владельческих проверок media)
// и read-after-write — сняв свою ссылку, ученик снова может прислать её тем
// же POST /media/link (единственный путь «заменить», отдельного PUT нет,
// ADR-0086 «Решение»). Роли, kind и статус попытки — против настоящей Mongo
// в media-assets.remove.spec.ts (CLAUDE.md «Тесты»): здесь только реальный
// HTTP-маршрут и владение. Настоящий AppModule на MongoMemoryServer.
import type { ApiErrorBody, ExamAttemptDto, ExamMediaDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Видео экзамена — снять запись (e2e, ADR-0086)', () => {
  let testApp: TestApp;
  const { server, startedAttempt } = createExamMediaTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  async function addedLink(
    cookie: string,
    attemptId: string,
    url: string,
  ): Promise<string> {
    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', cookie)
      .send({ url });
    return (res.body as ExamMediaDto).id;
  }

  it('чужую запись не снять — 404, code not_found, запись остаётся', async () => {
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });
    const attemptId = await startedAttempt(cookieA);
    const mediaId = await addedLink(cookieA, attemptId, 'https://vk.com/video-a');

    const res = await withCsrf(
      request(server()).delete(`/api/attempts/${attemptId}/media/${mediaId}`),
    ).set('Cookie', cookieB);

    expect(res.status).toBe(404);
    expect((res.body as ApiErrorBody).code).toBe('not_found');

    const list = await request(server()).get('/api/attempts').set('Cookie', cookieA);
    const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.media).toHaveLength(1);
  });

  it('снял свою ссылку — можно прислать новую, GET видит новую, не старую', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attemptId = await startedAttempt(cookie);
    const mediaId = await addedLink(cookie, attemptId, 'https://vk.com/video-old');

    const removed = await withCsrf(
      request(server()).delete(`/api/attempts/${attemptId}/media/${mediaId}`),
    ).set('Cookie', cookie);
    expect(removed.status).toBe(204);

    const second = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', cookie)
      .send({ url: 'https://vk.com/video-new' });
    expect(second.status).toBe(201);

    const list = await request(server()).get('/api/attempts').set('Cookie', cookie);
    const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.media).toHaveLength(1);
    expect(attempt?.media?.[0]?.url).toBe('https://vk.com/video-new');
  });
});
