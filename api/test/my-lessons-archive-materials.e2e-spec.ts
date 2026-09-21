// e2e на слой 3.9 (docs/PLAN.md §14, ADR-0056 «Ученик видит привязку там,
// где ищет») — материал, привязанный к дате занятия (`materials.lessonIds`),
// приезжает вместе с занятием в архиве ученика (`GET /me/lessons/archive`).
// Главный гейт — правило видимости служебных материалов (ADR-0058) действует
// и здесь, не только в библиотеке `/me/materials`
// (materials-staff-access.e2e-spec.ts): тот же приём проверки — грепаем
// сырой JSON тела ответа, ссылка не должна проступить ни в каком поле.
// Настоящий AppModule на MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { MyArchivedLessonDto } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { MaterialRecord } from '../src/materials/material.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('/me/lessons/archive — материалы даты (e2e, ADR-0056/ADR-0058)', () => {
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

  // Главный гейт задачи: правило видимости служебных материалов (ADR-0058)
  // нельзя обойти открыв архив вместо библиотеки материалов.
  it('служебный материал даты — в сыром JSON архива у ученика его нет вовсе; штат видит с url', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const lessonId = await createPastLesson(teacherCookie);
    const materialRes = await postMaterial(teacherCookie, {
      title: 'Разбор со вторника для преподавателей',
      url: 'https://example.com/staff-tuesday',
      kind: 'video',
      access: 'staff',
      lessonIds: [lessonId],
    });
    expect(materialRes.status).toBe(201);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    const studentRes = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', studentCookie);
    expect(studentRes.status).toBe(200);
    const studentRaw = JSON.stringify(studentRes.body);
    expect(studentRaw).not.toContain('https://example.com/staff-tuesday');
    const studentLesson = (studentRes.body as MyArchivedLessonDto[]).find(
      (l) => l.id === lessonId,
    );
    expect(studentLesson?.materials).toEqual([]);

    const staffRes = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', teacherCookie);
    expect(staffRes.status).toBe(200);
    const staffLesson = (staffRes.body as MyArchivedLessonDto[]).find(
      (l) => l.id === lessonId,
    );
    expect(staffLesson?.materials[0]?.url).toBe('https://example.com/staff-tuesday');
  });
});
