// e2e на роль assistant (помощник учителя, ТЗ «две новые роли»): правами
// равен учителю на данных школы (SECURITY §2) — правит занятие, видит список,
// но UsersController ему не отдан целиком (назначение ролей и удаление
// данных — только admin). Переиспользует фикстуры lessons.e2e-spec.ts и
// users.e2e-spec.ts (CLAUDE.md «Одна механика — один компонент»), отдельный
// файл — чтобы не раздувать уже полные lessons.e2e-spec.ts/users.e2e-spec.ts
// сверх лимита файл-храповика (CLAUDE.md «Храповики»).
import request from 'supertest';
import type { LessonDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  createLessonTestHelpers,
  STARTS_AT,
  FROM,
  TO,
} from './e2e-support/lessons-fixtures';
import { createUsersTestHelpers } from './e2e-support/users-fixtures';

describe('Роль assistant (e2e)', () => {
  let testApp: TestApp;
  const {
    server,
    sessionFor: sessionForLessons,
    classModel,
    lessonModel,
    createClass,
    postLesson,
    patchLesson,
  } = createLessonTestHelpers(() => testApp);
  const { getUsers, patchUser, createUser } = createUsersTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  });

  it('помощник учителя: PATCH занятия — 200, GET /lessons видит его', async () => {
    const teacherCookie = await sessionForLessons(['teacher']);
    const classId = await createClass();
    const created = await postLesson(teacherCookie, { classId, startsAt: STARTS_AT });
    const dto = created.body as LessonDto;

    const assistantCookie = await sessionForLessons(['assistant']);
    const patched = await patchLesson(assistantCookie, dto.id, {
      topic: 'Занятие ведёт помощник',
    });
    expect(patched.status).toBe(200);
    expect((patched.body as LessonDto).topic).toBe('Занятие ведёт помощник');

    const list = await request(server())
      .get('/api/lessons')
      .query({ from: FROM, to: TO })
      .set('Cookie', assistantCookie);
    expect(list.status).toBe(200);
    expect((list.body as LessonDto[]).some((l) => l.id === dto.id)).toBe(true);
  });

  it('помощник учителя: GET /users, PATCH и DELETE /users/:id — 403 (только admin)', async () => {
    const assistantCookie = await sessionForLessons(['assistant']);
    const target = await createUser();

    expect((await getUsers(assistantCookie)).status).toBe(403);
    expect(
      (await patchUser(assistantCookie, target.id, { roles: ['teacher'] })).status,
    ).toBe(403);
    const deleteRes = await withCsrf(
      request(server()).delete(`/api/users/${target.id}`),
    ).set('Cookie', assistantCookie);
    expect(deleteRes.status).toBe(403);
  });
});
