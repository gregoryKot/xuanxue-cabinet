// e2e на POST /lessons/:id/send-now (docs/PLAN.md §6 «Планирование», аудит
// В12) — данные школы (ADR-0010): доступ по роли, не по владельцу. Ветки по
// статусу рассылки — send-now.service.spec.ts (mongodb-memory-server, без
// HTTP); здесь — вход и read-after-write через настоящий GET /broadcasts
// (CLAUDE.md «Тесты»). Общие хелперы/модели — lessons-fixtures.ts (тот же
// приём, что у lessons-broadcast-status.e2e-spec.ts).
import request from 'supertest';
import type { ApiErrorBody, BroadcastDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createLessonTestHelpers, STARTS_AT } from './e2e-support/lessons-fixtures';

describe('POST /lessons/:id/send-now (e2e)', () => {
  let testApp: TestApp;
  const {
    server,
    sessionFor,
    classModel,
    lessonModel,
    broadcastModel,
    channelModel,
    deliveryModel,
    createClass,
    createSendableClass,
    postLesson,
  } = createLessonTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
    await broadcastModel().deleteMany({});
    await deliveryModel().deleteMany({});
    await channelModel().deleteMany({});
  });

  function sendNow(cookie: string, lessonId: string): request.Test {
    return withCsrf(request(server()).post(`/api/lessons/${lessonId}/send-now`)).set(
      'Cookie',
      cookie,
    );
  }

  it('без cookie — 401 в конверте', async () => {
    const res = await withCsrf(
      request(server()).post('/api/lessons/000000000000000000000000/send-now'),
    );
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик — 403', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const classId = await createSendableClass();
    const created = await postLesson(teacherCookie, { classId, startsAt: STARTS_AT });
    const studentCookie = await sessionFor([]);

    const res = await sendNow(studentCookie, (created.body as { id: string }).id);
    expect(res.status).toBe(403);
  });

  it('нет рассылки → 200, scheduled, scheduledAt в прошлом или сейчас (read-after-write)', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createSendableClass();
    const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
    const lessonId = (created.body as { id: string }).id;

    const res = await sendNow(cookie, lessonId);
    expect(res.status).toBe(200);
    const dto = res.body as BroadcastDto;
    expect(dto.status).toBe('scheduled');
    expect(new Date(dto.scheduledAt).getTime()).toBeLessThanOrEqual(Date.now());

    // Read-after-write: тот же документ виден в журнале, не только в ответе.
    const got = await request(server())
      .get(`/api/broadcasts/${dto.id}`)
      .set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect((got.body as BroadcastDto).status).toBe('scheduled');
  });

  it('cancelled — 200, рассылка снова scheduled, тот же id при повторе', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createSendableClass();
    const created = await postLesson(cookie, { classId, startsAt: STARTS_AT });
    const lessonId = (created.body as { id: string }).id;
    const cancelled = await broadcastModel().create({
      kind: 'lesson_link',
      lessonId,
      channelIds: [],
      scheduledAt: new Date(),
      text: 'тик опоздал: занятие началось больше 30 минут назад',
      status: 'cancelled',
    });

    const res = await sendNow(cookie, lessonId);
    expect(res.status).toBe(200);
    const dto = res.body as BroadcastDto;
    expect(dto.id).toBe(cancelled._id.toString());
    expect(dto.status).toBe('scheduled');

    const second = await sendNow(cookie, lessonId);
    expect((second.body as BroadcastDto).id).toBe(dto.id);
    await expect(broadcastModel().countDocuments({ lessonId })).resolves.toBe(1);
  });

  it('sent — 409, без ссылки — 400, невалидный ObjectId — 404', async () => {
    const cookie = await sessionFor(['teacher']);
    const classId = await createSendableClass();
    const sentLesson = await postLesson(cookie, { classId, startsAt: STARTS_AT });
    const sentLessonId = (sentLesson.body as { id: string }).id;
    await broadcastModel().create({
      kind: 'lesson_link',
      lessonId: sentLessonId,
      channelIds: [],
      scheduledAt: new Date(),
      sentAt: new Date(),
      text: 'x',
      status: 'sent',
    });
    const sentRes = await sendNow(cookie, sentLessonId);
    expect(sentRes.status).toBe(409);

    const noLinkClassId = await createClass();
    const noLinkLesson = await postLesson(cookie, {
      classId: noLinkClassId,
      startsAt: STARTS_AT,
    });
    const noLinkRes = await sendNow(cookie, (noLinkLesson.body as { id: string }).id);
    expect(noLinkRes.status).toBe(400);
    expect((noLinkRes.body as ApiErrorBody).message).toContain('нет ссылки');

    // `id` из пути — просто строка (SECURITY §3): не похожая на ObjectId
    // строка не должна улетать в Mongoose как CastError/500.
    const badIdRes = await sendNow(cookie, 'not-an-object-id');
    expect(badIdRes.status).toBe(404);
  });
});
