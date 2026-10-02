// e2e режима ученика для штата (ADR-0163) на настоящем AppModule и настоящем
// AuthGuard: PUT /me/student-mode — без сессии 401, ученик включить не может
// (403), штат включает и сразу видит кабинет глазами ученика (`roles: []` в
// /auth/me, штатный маршрут 403, дефолты уведомлений ученика), выключить можно
// всегда. Настоящие роли в БД режим не трогает — «Люди» показывают их, а оплаты
// и снимок перевода остаются только для настоящих учеников. Образец —
// me-no-telegram.e2e-spec.ts; инструкция — e2e-support/README.md.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import {
  STUDENT_MODE_PAYMENT_MESSAGE,
  STUDENT_MODE_STAFF_ONLY_MESSAGE,
  type ApiErrorBody,
  type MeDto,
  type NotificationPrefsDto,
  type PaymentsPageDto,
  type UserDto,
  type UserRole,
} from '@xuanxue/shared';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { jpegBytes } from './e2e-support/exam-images-fixtures';
import { withCsrf } from './e2e-support/http';
import { myPaymentsPage } from './e2e-support/my-payments';
import { createUserWithSession } from './e2e-support/session';

describe('Режим ученика для штата (e2e)', () => {
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

  function putMode(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).put('/api/me/student-mode'))
      .set('Cookie', cookie)
      .send(body);
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

  /** То, что лежит в БД, — минуя гвард и маппер: режим не должен менять роли. */
  async function rawUser(userId: string): Promise<UserRecord | null> {
    return userModel().findById(userId).lean<UserRecord>();
  }

  it('без сессии, но с x-requested-with — 401', async () => {
    const res = await withCsrf(request(server()).put('/api/me/student-mode')).send({
      enabled: true,
    });

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('с cookie, но без x-requested-with — 403 (CSRF раньше сессии)', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);

    const res = await request(server())
      .put('/api/me/student-mode')
      .set('Cookie', cookie)
      .send({ enabled: true });

    expect(res.status).toBe(403);
  });

  it('учитель включает: ответ — MeDto ученика, GET /auth/me то же самое (ADR-0087)', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);

    const put = await putMode(cookie, { enabled: true });

    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      roles: [],
      studentMode: true,
      canUseStudentMode: true,
    });
    const me = await get('/api/auth/me', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(put.body);
  });

  it('до включения у штата режим доступен, но не включён: роли целые', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);

    const me = (await get('/api/auth/me', cookie)).body as MeDto;

    expect(me).toMatchObject({
      roles: ['teacher'],
      studentMode: false,
      canUseStudentMode: true,
    });
  });

  it('штатный маршрут в режиме — 403, после выключения — 200, на той же сессии', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);
    expect((await get('/api/classes', cookie)).status).toBe(200);

    await putMode(cookie, { enabled: true });
    const closed = await get('/api/classes', cookie);
    expect(closed.status).toBe(403);
    expect((closed.body as ApiErrorBody).code).toBe('forbidden');

    // Выключатель не за штатной ролью: иначе человек остался бы в режиме навсегда.
    const off = await putMode(cookie, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ roles: ['teacher'], studentMode: false });
    expect((await get('/api/classes', cookie)).status).toBe(200);
  });

  it('уведомления в режиме — дефолт ученика (урок скоро), без штатных; после выключения — штатные', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);
    await putMode(cookie, { enabled: true });

    const asStudent = (await get('/api/me/notifications', cookie))
      .body as NotificationPrefsDto;

    expect(asStudent.enabled).toContain('lesson_soon');
    expect(asStudent.enabled).not.toContain('post_draft');
    expect((await get('/api/me/notifications/lessons', cookie)).status).toBe(200);

    await putMode(cookie, { enabled: false });
    const asStaff = (await get('/api/me/notifications', cookie))
      .body as NotificationPrefsDto;
    expect(asStaff.enabled).toContain('post_draft');
    expect(asStaff.enabled).not.toContain('lesson_soon');
  });

  it('ученик без ролей включить не может: 403 с понятным текстом, в БД ничего нет', async () => {
    const { userId, cookie } = await signIn('Ученик', []);

    const res = await putMode(cookie, { enabled: true });

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(STUDENT_MODE_STAFF_ONLY_MESSAGE);
    expect(await rawUser(userId)).not.toHaveProperty('studentModeAt');
    const me = (await get('/api/auth/me', cookie)).body as MeDto;
    expect(me).toMatchObject({ studentMode: false, canUseStudentMode: false });
  });

  it('бухгалтер — не штат: включить не может', async () => {
    const { cookie } = await signIn('Бухгалтер', ['accountant']);

    expect((await putMode(cookie, { enabled: true })).status).toBe(403);
  });

  it('ученик выключает режим — 200 и MeDto без изменений: выключить можно всегда', async () => {
    const { cookie } = await signIn('Ученик', []);

    const res = await putMode(cookie, { enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ roles: [], studentMode: false });
  });

  it('повторное включение момент не меняет', async () => {
    const { userId, cookie } = await signIn('Мария', ['teacher']);
    await putMode(cookie, { enabled: true });
    const first = (await rawUser(userId))?.studentModeAt;
    expect(first).toBeInstanceOf(Date);

    const again = await putMode(cookie, { enabled: true });

    expect(again.status).toBe(200);
    expect((await rawUser(userId))?.studentModeAt).toEqual(first);
  });

  it('кривое тело — 400; чужой userId в теле — 400 и никого не переключает', async () => {
    const teacher = await signIn('Мария', ['teacher']);
    const other = await signIn('Анна', ['teacher']);

    expect((await putMode(teacher.cookie, { enabled: 'да' })).status).toBe(400);
    const res = await putMode(teacher.cookie, { enabled: true, userId: other.userId });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    expect(await rawUser(other.userId)).not.toHaveProperty('studentModeAt');
    expect(await rawUser(teacher.userId)).not.toHaveProperty('studentModeAt');
  });

  it('режим одного человека не переключает других: А в режиме, Б — штат как был', async () => {
    const a = await signIn('А', ['teacher']);
    const b = await signIn('Б', ['teacher']);

    await putMode(a.cookie, { enabled: true });

    expect((await get('/api/classes', a.cookie)).status).toBe(403);
    expect((await get('/api/classes', b.cookie)).status).toBe(200);
    expect(((await get('/api/auth/me', b.cookie)).body as MeDto).studentMode).toBe(false);
  });

  describe('админ в режиме ученика', () => {
    it('сам в «Люди» не пускается, но другой админ видит его с настоящими ролями', async () => {
      const inMode = await signIn('Дима', ['admin']);
      const other = await signIn('Второй админ', ['admin']);
      await putMode(inMode.cookie, { enabled: true });

      expect((await get('/api/users', inMode.cookie)).status).toBe(403);

      const people = (await get('/api/users', other.cookie)).body as UserDto[];
      expect(people.find((u) => u.id === inMode.userId)?.roles).toEqual(['admin']);
      expect((await rawUser(inMode.userId))?.roles).toEqual(['admin']);
    });

    it('единственный админ в режиме не может снять с себя роль: маршрут закрыт, роли в БД целы', async () => {
      const sole = await signIn('Дима', ['admin']);
      await putMode(sole.cookie, { enabled: true });

      const demote = await withCsrf(request(server()).patch(`/api/users/${sole.userId}`))
        .set('Cookie', sole.cookie)
        .send({ roles: [] });

      expect(demote.status).toBe(403);
      expect((await rawUser(sole.userId))?.roles).toEqual(['admin']);
    });
  });

  describe('оплаты: только настоящие ученики', () => {
    const month = DateTime.utc().toFormat('yyyy-MM');

    it('бухгалтер не видит штат в режиме среди учеников и не заводит ему абонемент', async () => {
      const accountant = await signIn('Бухгалтер', ['accountant']);
      const student = await signIn('Ученик', []);
      const teacher = await signIn('Мария', ['teacher']);
      await putMode(teacher.cookie, { enabled: true });

      const page = (await get(`/api/payments?month=${month}`, accountant.cookie))
        .body as PaymentsPageDto;
      const ids = page.rows.map((row) => row.userId);
      expect(ids).toContain(student.userId);
      expect(ids).not.toContain(teacher.userId);

      const confirm = await withCsrf(
        request(server()).post(`/api/payments/${teacher.userId}/${month}/confirm`),
      )
        .set('Cookie', accountant.cookie)
        .send({});
      expect(confirm.status).toBe(400);
    });

    it('снимок перевода из кабинета в режиме — 403, оплата не заводится; без режима у ученика — как раньше', async () => {
      const teacher = await signIn('Мария', ['teacher']);
      await putMode(teacher.cookie, { enabled: true });

      const refused = await withCsrf(
        request(server()).post(`/api/me/payments/${month}/screenshot`),
      )
        .set('Cookie', teacher.cookie)
        .set('Content-Type', 'image/jpeg')
        .send(jpegBytes());

      expect(refused.status).toBe(403);
      expect((refused.body as ApiErrorBody).message).toBe(STUDENT_MODE_PAYMENT_MESSAGE);
      expect((await myPaymentsPage(testApp.app, teacher.cookie)).rows).toEqual([]);

      const student = await signIn('Ученик', []);
      const accepted = await withCsrf(
        request(server()).post(`/api/me/payments/${month}/screenshot`),
      )
        .set('Cookie', student.cookie)
        .set('Content-Type', 'image/jpeg')
        .send(jpegBytes());
      expect(accepted.status).toBe(201);
    });
  });
});
