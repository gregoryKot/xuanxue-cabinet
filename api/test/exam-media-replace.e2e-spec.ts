// e2e замены ссылки на видео-ответ (ADR-0086) — вынесено из
// exam-media.e2e-spec.ts (файл-лимит, тот же приём, что
// exam-attempts-deadline.e2e-spec.ts у exam-attempts.e2e-spec.ts). Повторная
// ссылка на тот же вопрос заменяет прежнюю, пока работу не проверили; после
// `status: 'graded'` замена запрещена. Настоящий AppModule на
// MongoMemoryServer.
import {
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  type ApiErrorBody,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Видео экзамена — замена ссылки (ADR-0086, e2e)', () => {
  let testApp: TestApp;
  const { server, startedAttempt } = createExamMediaTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  // ADR-0086: повторная ссылка на тот же вопрос заменяет прежнюю, а не
  // получает отказ — ученику нужно прислать правильную, а не «убрать».
  it('вторая ссылка на ту же попытку — заменяет первую, read-after-write', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attemptId = await startedAttempt(cookie);
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/media/link`))
      .set('Cookie', cookie)
      .send({ url: 'https://vk.com/video-1' });

    const second = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', cookie)
      .send({ url: 'https://vk.com/video-2' });

    expect(second.status).toBe(201);
    const list = await request(server()).get('/api/attempts').set('Cookie', cookie);
    const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.media).toHaveLength(1);
    expect(attempt?.media?.[0]?.url).toBe('https://vk.com/video-2');
  });

  it('попытка graded — 409, прежняя ссылка не менялась', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attemptId = await startedAttempt(studentCookie);
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/media/link`))
      .set('Cookie', studentCookie)
      .send({ url: 'https://vk.com/video-1' });
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    await withCsrf(request(server()).put(`/api/attempts/${attemptId}/grading`))
      .set('Cookie', teacherCookie)
      .send({ outcome: 'passed', comment: 'Хорошо' });

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/link`),
    )
      .set('Cookie', studentCookie)
      .send({ url: 'https://vk.com/video-2' });

    expect(res.status).toBe(409);
    const body = res.body as ApiErrorBody;
    expect(body.message).toBe(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE);
    const list = await request(server())
      .get('/api/attempts')
      .set('Cookie', studentCookie);
    const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attempt?.media).toHaveLength(1);
    expect(attempt?.media?.[0]?.url).toBe('https://vk.com/video-1');
  });
});
