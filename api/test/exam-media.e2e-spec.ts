// e2e видео экзамена — запасные пути (ADR-0023, PLAN §11 слой 4.5): ссылка
// (владелец из сессии, SECURITY §3) и ручная отметка учителя (роль). Основной
// путь — сообщение боту — не HTTP, его привязка проверена против настоящей
// Mongo в media-assets.service.spec.ts (SECURITY §3: чужой attemptId ничего
// не привязывает). itemId (ADR-0037) и замена ссылки (ADR-0086) — отдельными
// файлами, exam-media-item.e2e-spec.ts и exam-media-replace.e2e-spec.ts
// (файл-лимит, тот же приём, что exam-attempts-deadline.e2e-spec.ts у
// exam-attempts.e2e-spec.ts). Настоящий AppModule на MongoMemoryServer.
import type { ApiErrorBody, AttemptReviewDto, ExamAttemptDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Видео экзамена — ссылка и ручная отметка (e2e)', () => {
  let testApp: TestApp;
  const { server, startedAttempt } = createExamMediaTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  describe('POST /attempts/:id/media/link', () => {
    it('валидная ссылка — сохраняется и видна владельцу в GET /attempts', async () => {
      const { cookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик',
        roles: [],
      });
      const attemptId = await startedAttempt(cookie);

      const res = await withCsrf(
        request(server()).post(`/api/attempts/${attemptId}/media/link`),
      )
        .set('Cookie', cookie)
        .send({ url: 'https://vk.com/video-12345' });
      expect(res.status).toBe(201);

      const list = await request(server()).get('/api/attempts').set('Cookie', cookie);
      const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
      expect(attempt?.media).toHaveLength(1);
      expect(attempt?.media?.[0]?.kind).toBe('link');
      expect(attempt?.media?.[0]?.url).toBe('https://vk.com/video-12345');
    });

    it('мусор вместо ссылки — 400 с русским текстом, ничего не сохранено', async () => {
      const { cookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик',
        roles: [],
      });
      const attemptId = await startedAttempt(cookie);

      const res = await withCsrf(
        request(server()).post(`/api/attempts/${attemptId}/media/link`),
      )
        .set('Cookie', cookie)
        .send({ url: 'не ссылка' });

      expect(res.status).toBe(400);
      const body = res.body as ApiErrorBody;
      expect(body.details?.join(' ')).toMatch(/[а-яё]/i);

      const list = await request(server()).get('/api/attempts').set('Cookie', cookie);
      const attempt = (list.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
      expect(attempt?.media).toEqual([]);
    });

    it('чужая попытка — 404, не 403 (не подтверждаем существование)', async () => {
      const { cookie: cookieA } = await createUserWithSession(testApp.app, {
        name: 'Ученик А',
        roles: [],
      });
      const { cookie: cookieB } = await createUserWithSession(testApp.app, {
        name: 'Ученик Б',
        roles: [],
      });
      const attemptId = await startedAttempt(cookieA);

      const res = await withCsrf(
        request(server()).post(`/api/attempts/${attemptId}/media/link`),
      )
        .set('Cookie', cookieB)
        .send({ url: 'https://vk.com/attempt-a-video' });

      expect(res.status).toBe(404);
      expect((res.body as ApiErrorBody).code).toBe('not_found');
    });

    // Замена повторной ссылкой на тот же вопрос (ADR-0086) — отдельным
    // файлом, exam-media-replace.e2e-spec.ts (файл-лимит).
  });

  describe('POST /attempts/:id/media/manual', () => {
    it('ученику — 403', async () => {
      const { cookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик',
        roles: [],
      });
      const attemptId = await startedAttempt(cookie);

      const res = await withCsrf(
        request(server()).post(`/api/attempts/${attemptId}/media/manual`),
      )
        .set('Cookie', cookie)
        .send({ note: 'Прислал в WhatsApp' });

      expect(res.status).toBe(403);
    });

    it('учителю — 201, отметка видна в карточке проверки, а не только владельцу', async () => {
      const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик',
        roles: [],
      });
      const attemptId = await startedAttempt(studentCookie);
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
        'Cookie',
        studentCookie,
      );

      const res = await withCsrf(
        request(server()).post(`/api/attempts/${attemptId}/media/manual`),
      )
        .set('Cookie', teacherCookie)
        .send({ note: 'Прислал в WhatsApp, отметила Мария' });
      expect(res.status).toBe(201);

      const review = await request(server())
        .get(`/api/attempts/${attemptId}/review`)
        .set('Cookie', teacherCookie);
      const reviewBody = review.body as AttemptReviewDto;
      expect(reviewBody.media).toHaveLength(1);
      expect(reviewBody.media?.[0]?.kind).toBe('manual');
      expect(reviewBody.media?.[0]?.note).toBe('Прислал в WhatsApp, отметила Мария');
      // fileId/fileUniqueId никогда не уходят наружу ни одной роли — их и
      // не может быть у manual, но проверяем инвариант на всём ответе.
      expect(JSON.stringify(review.body)).not.toContain('fileId');
    });

    it('несуществующая попытка — 404', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);

      const res = await withCsrf(
        request(server()).post('/api/attempts/507f1f77bcf86cd799439099/media/manual'),
      )
        .set('Cookie', teacherCookie)
        .send({});

      expect(res.status).toBe(404);
    });
  });
});
