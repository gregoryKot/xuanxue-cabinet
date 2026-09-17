// PLAN.md §11 «Тесты, без которых этап не закрыт»: «ученик А не видит ни
// file_id, ни ссылку на видео ученика Б». Видео из бота — не HTTP (его
// привязка проверена против настоящей Mongo в media-assets.service.spec.ts
// и exam-attempt-flow.ownership.spec.ts), поэтому запись kind: 'telegram'
// заводится тем же MediaAssetsService, что зовёт ExamMediaMessageHandler, а
// дальше — только настоящие маршруты кабинета: владельцу, соседу-ученику и
// учителю. Настоящий AppModule на MongoMemoryServer.
import { DateTime } from 'luxon';
import type { AttemptReviewDto, ExamAttemptDto } from '@xuanxue/shared';
import request from 'supertest';
import { MediaAssetsService } from '../src/media/media-assets.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor } from './e2e-support/http';

const FILE_ID = 'BAACAgIAAxkBAAI-secret-file-id';
const FILE_UNIQUE_ID = 'AgAD-secret-unique-id';
const LINK_URL = 'https://vk.com/video-secret-of-b';

describe('Видео экзамена из бота — file_id и ссылка не видны никому чужому (e2e)', () => {
  let testApp: TestApp;
  const { server, startedAttemptWithItems } = createExamMediaTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('владелец видит своё видео без file_id; сосед не видит ни попытки, ни ссылки; учитель — видео без file_id', async () => {
    const { userId: userIdA, cookie: cookieA } = await createUserWithSession(
      testApp.app,
      {
        name: 'Ученик А',
        roles: [],
      },
    );
    const { userId: userIdB, cookie: cookieB } = await createUserWithSession(
      testApp.app,
      {
        name: 'Ученик Б',
        roles: [],
      },
    );
    const { attemptId, videoItemId } = await startedAttemptWithItems(cookieA);

    // Видео А пришло боту (kind: 'telegram' с file_id) — тем же сервисом,
    // что ExamMediaMessageHandler; ссылка Б — обычным маршрутом.
    const mediaAssets = testApp.app.get(MediaAssetsService, { strict: false });
    const attached = await mediaAssets.attachTelegramVideo(
      attemptId,
      userIdA,
      { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID, durationSec: 42 },
      DateTime.utc(),
      videoItemId,
    );
    expect(attached).not.toBeNull();
    const { attemptId: attemptIdB } = await startedAttemptWithItems(cookieB);
    await mediaAssets.addLink(attemptIdB, userIdB, LINK_URL, DateTime.utc());

    // Владелец: запись есть, длительность есть, file_id — нет.
    const listA = await request(server()).get('/api/attempts').set('Cookie', cookieA);
    expect(listA.status).toBe(200);
    const attemptA = (listA.body as ExamAttemptDto[]).find((a) => a.id === attemptId);
    expect(attemptA?.media).toHaveLength(1);
    expect(attemptA?.media?.[0]).toMatchObject({
      kind: 'telegram',
      itemId: videoItemId,
      durationSec: 42,
    });
    const rawA = JSON.stringify(listA.body);
    expect(rawA).not.toContain(FILE_ID);
    expect(rawA).not.toContain(FILE_UNIQUE_ID);
    expect(rawA).not.toContain('fileId');
    // …и ссылки Б в списке А нет вовсе: чужая попытка в свой список не попадает.
    expect(rawA).not.toContain(LINK_URL);

    // Сосед: попытка А не в списке, карточка проверки закрыта ролью.
    const listB = await request(server()).get('/api/attempts').set('Cookie', cookieB);
    const rawB = JSON.stringify(listB.body);
    expect((listB.body as ExamAttemptDto[]).some((a) => a.id === attemptId)).toBe(false);
    expect(rawB).not.toContain(FILE_ID);
    expect(rawB).not.toContain('durationSec');
    const reviewByB = await request(server())
      .get(`/api/attempts/${attemptId}/review`)
      .set('Cookie', cookieB);
    expect(reviewByB.status).toBe(403);
    expect(JSON.stringify(reviewByB.body)).not.toContain(FILE_ID);

    // Учитель: видео в карточке проверки — есть, file_id — нет и ему.
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const review = await request(server())
      .get(`/api/attempts/${attemptId}/review`)
      .set('Cookie', teacherCookie);
    expect(review.status).toBe(200);
    expect((review.body as AttemptReviewDto).media?.[0]?.kind).toBe('telegram');
    const rawReview = JSON.stringify(review.body);
    expect(rawReview).not.toContain(FILE_ID);
    expect(rawReview).not.toContain(FILE_UNIQUE_ID);
    expect(rawReview).not.toContain('fileId');
  });
});
