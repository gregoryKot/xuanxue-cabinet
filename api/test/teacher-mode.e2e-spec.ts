// e2e режима учителя для админа («Разработчик», ADR-0190) на настоящем AppModule
// и настоящем AuthGuard: PUT /me/teacher-mode — без сессии 401, не-админ включить
// не может (403), админ включает и сразу видит кабинет глазами учителя (`roles:
// ['teacher']` в /auth/me, маршрут только админа 403, учительский 200), выключить
// можно всегда. Настоящие роли в БД режим не трогает — «Люди» и защита последнего
// админа видят админа, а рассылки штату читают роли из базы. С режимом ученика они
// взаимоисключающие. Образец — student-mode.e2e-spec.ts; инструкция —
// e2e-support/README.md.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import {
  TEACHER_MODE_ADMIN_ONLY_MESSAGE,
  type ApiErrorBody,
  type MeDto,
  type NotificationPrefsDto,
  type UserDto,
  type UserRole,
} from '@xuanxue/shared';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { UsersService } from '../src/users/users.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

// Маршрут только админа (`@Roles('admin')` на классе) и маршрут учителя.
const ADMIN_ONLY_ROUTE = '/api/users';
const TEACHER_ROUTE = '/api/classes';

describe('Режим учителя для админа (e2e)', () => {
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

  function userModel(): Model<UserRecord> {
    return testApp.app.get(getModelToken(USER_MODEL_NAME), { strict: false });
  }

  function putMode(
    route: 'teacher-mode' | 'student-mode',
    cookie: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).put(`/api/me/${route}`))
      .set('Cookie', cookie)
      .send(body);
  }

  function putTeacher(cookie: string, body: Record<string, unknown>): request.Test {
    return putMode('teacher-mode', cookie, body);
  }

  function get(path: string, cookie: string): request.Test {
    return request(server()).get(path).set('Cookie', cookie);
  }

  async function signIn(
    name: string,
    roles: UserRole[],
  ): Promise<{ userId: string; cookie: string }> {
    return createUserWithSession(testApp.app, { name, roles });
  }

  async function me(cookie: string): Promise<MeDto> {
    return (await get('/api/auth/me', cookie)).body as MeDto;
  }

  /** То, что лежит в БД, — минуя гвард и маппер: режим не должен менять роли. */
  async function rawUser(userId: string): Promise<UserRecord | null> {
    return userModel().findById(userId).lean<UserRecord>();
  }

  it('без сессии, но с x-requested-with — 401', async () => {
    const res = await withCsrf(request(server()).put('/api/me/teacher-mode')).send({
      enabled: true,
    });

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('с cookie, но без x-requested-with — 403 (CSRF раньше сессии)', async () => {
    const { cookie } = await signIn('Дима', ['admin']);

    const res = await request(server())
      .put('/api/me/teacher-mode')
      .set('Cookie', cookie)
      .send({ enabled: true });

    expect(res.status).toBe(403);
  });

  it('админ включает: ответ — MeDto учителя, GET /auth/me то же самое (ADR-0087)', async () => {
    const { cookie } = await signIn('Дима', ['admin']);
    // До включения режим доступен, но не включён: роли целые.
    expect(await me(cookie)).toMatchObject({
      roles: ['admin'],
      teacherMode: false,
      canUseTeacherMode: true,
    });

    const put = await putTeacher(cookie, { enabled: true });

    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      roles: ['teacher'],
      teacherMode: true,
      canUseTeacherMode: true,
      studentMode: false,
    });
    const current = await get('/api/auth/me', cookie);
    expect(current.status).toBe(200);
    expect(current.body).toEqual(put.body);
  });

  it('маршрут только админа в режиме — 403, учительский — 200; после выключения админский снова 200, на той же сессии', async () => {
    const { cookie } = await signIn('Дима', ['admin']);
    expect((await get(ADMIN_ONLY_ROUTE, cookie)).status).toBe(200);

    await putTeacher(cookie, { enabled: true });
    const closed = await get(ADMIN_ONLY_ROUTE, cookie);
    expect(closed.status).toBe(403);
    expect((closed.body as ApiErrorBody).code).toBe('forbidden');
    expect((await get(TEACHER_ROUTE, cookie)).status).toBe(200);

    // Выключатель не за ролью admin: иначе человек остался бы в режиме навсегда.
    const off = await putTeacher(cookie, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ roles: ['admin'], teacherMode: false });
    expect((await get(ADMIN_ONLY_ROUTE, cookie)).status).toBe(200);
  });

  it('уведомления в режиме — дефолт учителя (очередь проверки), без сбоев кабинета; после выключения — админские', async () => {
    const { cookie } = await signIn('Дима', ['admin']);
    await putTeacher(cookie, { enabled: true });

    const asTeacher = (await get('/api/me/notifications', cookie))
      .body as NotificationPrefsDto;
    expect(asTeacher.enabled).toContain('attempt_submitted');
    expect(asTeacher.enabled).not.toContain('app_error');

    await putTeacher(cookie, { enabled: false });
    const asAdmin = (await get('/api/me/notifications', cookie))
      .body as NotificationPrefsDto;
    expect(asAdmin.enabled).toContain('app_error');
    expect(asAdmin.enabled).not.toContain('attempt_submitted');
  });

  it('рассылки штату читают роли из БД: админ в режиме остаётся получателем админских видов', async () => {
    const { userId, cookie } = await signIn('Дима', ['admin']);
    await putTeacher(cookie, { enabled: true });

    const recipients = await testApp.app.get(UsersService).listActiveWithRoles(['admin']);

    expect(recipients.map((r) => r.id)).toContain(userId);
  });

  it.each([
    ['учитель', ['teacher']],
    ['помощник', ['assistant']],
    ['бухгалтер', ['accountant']],
    ['ученик без ролей', []],
  ] as const)(
    '%s включить не может: 403 с понятным текстом, в БД ничего нет',
    async (_, roles) => {
      const { userId, cookie } = await signIn('Мария', [...roles]);

      const res = await putTeacher(cookie, { enabled: true });

      expect(res.status).toBe(403);
      expect((res.body as ApiErrorBody).message).toBe(TEACHER_MODE_ADMIN_ONLY_MESSAGE);
      expect(await rawUser(userId)).not.toHaveProperty('teacherModeAt');
      expect(await me(cookie)).toMatchObject({
        teacherMode: false,
        canUseTeacherMode: false,
      });
    },
  );

  it('учитель выключает режим — 200 и MeDto без изменений: выключить можно всегда', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);

    const res = await putTeacher(cookie, { enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ roles: ['teacher'], teacherMode: false });
  });

  it('повторное включение момент не меняет', async () => {
    const { userId, cookie } = await signIn('Дима', ['admin']);
    await putTeacher(cookie, { enabled: true });
    const first = (await rawUser(userId))?.teacherModeAt;
    expect(first).toBeInstanceOf(Date);

    const again = await putTeacher(cookie, { enabled: true });

    expect(again.status).toBe(200);
    expect((await rawUser(userId))?.teacherModeAt).toEqual(first);
  });

  it('кривое тело — 400; чужой userId в теле — 400 и никого не переключает', async () => {
    const admin = await signIn('Дима', ['admin']);
    const other = await signIn('Второй админ', ['admin']);

    expect((await putTeacher(admin.cookie, { enabled: 'да' })).status).toBe(400);
    const res = await putTeacher(admin.cookie, { enabled: true, userId: other.userId });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    expect(await rawUser(other.userId)).not.toHaveProperty('teacherModeAt');
    expect(await rawUser(admin.userId)).not.toHaveProperty('teacherModeAt');
  });

  it('режим одного человека не переключает других: А в режиме, Б — админ как был', async () => {
    const a = await signIn('А', ['admin']);
    const b = await signIn('Б', ['admin']);

    await putTeacher(a.cookie, { enabled: true });

    expect((await get(ADMIN_ONLY_ROUTE, a.cookie)).status).toBe(403);
    expect((await get(ADMIN_ONLY_ROUTE, b.cookie)).status).toBe(200);
    expect((await me(b.cookie)).teacherMode).toBe(false);
  });

  describe('роли в базе не меняются', () => {
    it('другой админ видит его в «Людях» с настоящими ролями', async () => {
      const inMode = await signIn('Дима', ['admin']);
      const other = await signIn('Второй админ', ['admin']);
      await putTeacher(inMode.cookie, { enabled: true });

      const people = (await get(ADMIN_ONLY_ROUTE, other.cookie)).body as UserDto[];

      expect(people.find((u) => u.id === inMode.userId)?.roles).toEqual(['admin']);
      expect((await rawUser(inMode.userId))?.roles).toEqual(['admin']);
    });

    it('единственный админ в режиме не может снять с себя роль: маршрут закрыт, роли в БД целы', async () => {
      const sole = await signIn('Дима', ['admin']);
      await putTeacher(sole.cookie, { enabled: true });

      const demote = await withCsrf(request(server()).patch(`/api/users/${sole.userId}`))
        .set('Cookie', sole.cookie)
        .send({ roles: [] });

      expect(demote.status).toBe(403);
      expect((await rawUser(sole.userId))?.roles).toEqual(['admin']);
    });
  });

  describe('режимы учителя и ученика взаимоисключающие', () => {
    it('админ в режиме ученика включает учителя: ученика нет, роли [teacher]', async () => {
      const { userId, cookie } = await signIn('Дима', ['admin']);
      await putMode('student-mode', cookie, { enabled: true });
      expect(await me(cookie)).toMatchObject({ roles: [], studentMode: true });

      const put = await putTeacher(cookie, { enabled: true });

      expect(put.status).toBe(200);
      expect(put.body).toMatchObject({
        roles: ['teacher'],
        teacherMode: true,
        studentMode: false,
      });
      const raw = await rawUser(userId);
      expect(raw).not.toHaveProperty('studentModeAt');
      expect(raw?.teacherModeAt).toBeInstanceOf(Date);
      expect(await me(cookie)).toEqual(put.body);
    });

    it('админ в режиме учителя включает ученика: учителя нет, роли пустые', async () => {
      const { userId, cookie } = await signIn('Дима', ['admin']);
      await putTeacher(cookie, { enabled: true });
      // Из режима учителя переключатель ученика виден: [teacher] — роль штата.
      expect(await me(cookie)).toMatchObject({ canUseStudentMode: true });

      const put = await putMode('student-mode', cookie, { enabled: true });

      expect(put.body).toMatchObject({
        roles: [],
        studentMode: true,
        teacherMode: false,
      });
      const raw = await rawUser(userId);
      expect(raw).not.toHaveProperty('teacherModeAt');
      expect(raw?.studentModeAt).toBeInstanceOf(Date);
      expect((await get(TEACHER_ROUTE, cookie)).status).toBe(403);
    });
  });
});
