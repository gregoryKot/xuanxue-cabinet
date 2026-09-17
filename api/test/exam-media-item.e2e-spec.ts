// e2e itemId у видео экзамена (ADR-0037) — вынесено из exam-media.e2e-spec.ts
// (файл-лимит, тот же приём, что exam-attempts-deadline.e2e-spec.ts у
// exam-attempts.e2e-spec.ts): ссылка адресуется конкретному video-вопросу
// снимка, не попытке целиком. Настоящий AppModule на MongoMemoryServer.
import type { ApiErrorBody, ExamAttemptDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Видео экзамена — itemId (ADR-0037, e2e)', () => {
  let testApp: TestApp;
  const { server, startedAttemptWithItems } = createExamMediaTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('ссылка с itemId — read-after-write, запись видна у правильного вопроса', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(cookie);

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', cookie)
      .send({ url: 'https://vk.com/video-12345', itemId: videoItemId });
    expect(res.status).toBe(201);

    const list = await request(server()).get('/api/attempts').set('Cookie', cookie);
    const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.media).toHaveLength(1);
    expect(attempt?.media?.[0]?.itemId).toBe(videoItemId);
  });

  it('itemId чужого вопроса (не из снимка) — 404, ничего не сохранено', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId } = await startedAttemptWithItems(cookie);

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', cookie)
      .send({ url: 'https://vk.com/video-1', itemId: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(404);
    expect((res.body as ApiErrorBody).code).toBe('not_found');
    const list = await request(server()).get('/api/attempts').set('Cookie', cookie);
    const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.media).toEqual([]);
  });

  it('itemId вопроса не video (text) — 404', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, textItemId } = await startedAttemptWithItems(cookie);

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', cookie)
      .send({ url: 'https://vk.com/video-1', itemId: textItemId });

    expect(res.status).toBe(404);
  });
});
