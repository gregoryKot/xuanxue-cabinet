// e2e на слой 3.9 (docs/PLAN.md §14, ADR-0056 «Ученик видит привязку там,
// где ищет») — материал, привязанный к дате занятия (`materials.lessonIds`),
// приезжает вместе с занятием в архиве ученика (`GET /me/lessons/archive`).
// Главный гейт — рубильник платного доступа (ADR-0048) действует и здесь, не
// только в библиотеке `/me/materials` (materials-access.e2e-spec.ts): тот же
// приём проверки — грепаем сырой JSON тела ответа, ссылка не должна
// проступить ни в каком поле. Настоящий AppModule на MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { MyArchivedLessonDto } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { MaterialRecord } from '../src/materials/material.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('/me/lessons/archive — материалы даты (e2e, ADR-0056/ADR-0048)', () => {
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

  function classModel(): Model<ClassRecord> {
    return testApp.app.get(getModelToken(ClassRecord.name), { strict: false });
  }

  function lessonModel(): Model<LessonRecord> {
    return testApp.app.get(getModelToken(LessonRecord.name), { strict: false });
  }

  function materialModel(): Model<MaterialRecord> {
    return testApp.app.get(getModelToken(MaterialRecord.name), { strict: false });
  }

  afterEach(async () => {
    await materialModel().deleteMany({});
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  });

  function postLesson(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/lessons'))
      .set('Cookie', cookie)
      .send(body);
  }

  function postMaterial(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/materials'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchSettings(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function createPastLesson(teacherCookie: string): Promise<string> {
    const cls = await classModel().create({
      title: 'Тайцзицюань',
      groupLabel: 'группа А',
      format: 'online',
    });
    const res = await postLesson(teacherCookie, {
      classId: cls._id.toString(),
      startsAt: '2026-09-01T16:00:00.000Z',
      topic: 'Форма 24',
    });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  }

  it('учитель заводит занятие и материал с lessonIds — ученик видит материал у своей даты', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const lessonId = await createPastLesson(teacherCookie);
    const materialRes = await postMaterial(teacherCookie, {
      title: 'Ссылка со вторника',
      url: 'https://example.com/tuesday-link',
      kind: 'article',
      lessonIds: [lessonId],
    });
    expect(materialRes.status).toBe(201);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const res = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(200);
    const body = res.body as MyArchivedLessonDto[];
    const lesson = body.find((l) => l.id === lessonId);
    expect(lesson?.materials.map((m) => m.title)).toEqual(['Ссылка со вторника']);
    expect(lesson?.materials[0]?.url).toBe('https://example.com/tuesday-link');
  });

  // Главный гейт задачи: рубильник ADR-0048 нельзя обойти открыв архив
  // вместо библиотеки материалов.
  it('рубильник включён — в сыром JSON архива у ученика ссылки закрытого материала нет, locked:true; штат ссылку получает', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const lessonId = await createPastLesson(teacherCookie);
    const materialRes = await postMaterial(teacherCookie, {
      title: 'Платный разбор со вторника',
      url: 'https://example.com/paid-tuesday',
      kind: 'video',
      access: 'paid',
      lessonIds: [lessonId],
    });
    expect(materialRes.status).toBe(201);
    const settingsRes = await patchSettings(teacherCookie, { materialsPaidAccess: true });
    expect(settingsRes.status).toBe(200);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const studentRes = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', studentCookie);
    expect(studentRes.status).toBe(200);
    const studentRaw = JSON.stringify(studentRes.body);
    expect(studentRaw).not.toContain('https://example.com/paid-tuesday');
    const studentLesson = (studentRes.body as MyArchivedLessonDto[]).find(
      (l) => l.id === lessonId,
    );
    expect(studentLesson?.materials[0]?.locked).toBe(true);
    expect(studentLesson?.materials[0]).not.toHaveProperty('url');

    const staffRes = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', teacherCookie);
    expect(staffRes.status).toBe(200);
    const staffLesson = (staffRes.body as MyArchivedLessonDto[]).find(
      (l) => l.id === lessonId,
    );
    expect(staffLesson?.materials[0]?.url).toBe('https://example.com/paid-tuesday');
    expect(staffLesson?.materials[0]).not.toHaveProperty('locked');
  });
});
