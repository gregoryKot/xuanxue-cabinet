// e2e на /groups и на группы в /classes — данные школы (ADR-0010, ADR-0193):
// доступ по роли, не по владельцу (e2e-support/README.md, «данные школы»).
// Настоящий AppModule на MongoMemoryServer — те же гвард/пайпы/фильтры, что
// видит браузер.
import { Types } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ClassDto, GroupDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const CLASS_BODY = { title: 'Тайцзицюань', format: 'online' as const, channelIds: [] };

describe('Группы школы (e2e)', () => {
  let testApp: TestApp;
  // Тесты делят базу, поэтому у каждого свои названия: счёт ведётся по id.
  let counter = 0;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function uniqueName(): string {
    counter += 1;
    return `Группа ${counter}`;
  }

  function postGroup(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/groups'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function createGroup(cookie: string, name = uniqueName()): Promise<GroupDto> {
    const res = await postGroup(cookie, { name });
    expect(res.status).toBe(201);
    return res.body as GroupDto;
  }

  function postClass(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send({ ...CLASS_BODY, ...body });
  }

  it('GET /groups без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/groups');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик: GET, POST, PATCH и DELETE /groups — 403', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const group = await createGroup(teacher);

    const results = [
      await request(server()).get('/api/groups').set('Cookie', cookie),
      await postGroup(cookie, { name: uniqueName() }),
      await withCsrf(request(server()).patch(`/api/groups/${group.id}`))
        .set('Cookie', cookie)
        .send({ name: 'Чужое' }),
      await withCsrf(request(server()).delete(`/api/groups/${group.id}`)).set(
        'Cookie',
        cookie,
      ),
    ];

    expect(results.map((res) => res.status)).toEqual([403, 403, 403, 403]);
    const list = await request(server()).get('/api/groups').set('Cookie', teacher);
    expect((list.body as GroupDto[]).find((g) => g.id === group.id)?.name).toBe(
      group.name,
    );
  });

  describe('учитель', () => {
    it('CRUD целиком: create → list → rename → delete → 404', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);

      const dto = await createGroup(cookie);
      expect(dto.classCount).toBe(0);
      // Документ Mongoose наружу не возвращается (CLAUDE.md, раздел «API»).
      expect(dto).not.toHaveProperty('_id');
      expect(dto).not.toHaveProperty('nameKey');

      const list = await request(server()).get('/api/groups').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect((list.body as GroupDto[]).some((g) => g.id === dto.id)).toBe(true);

      const renamed = await withCsrf(request(server()).patch(`/api/groups/${dto.id}`))
        .set('Cookie', cookie)
        .send({ name: 'Вечерние' });
      expect(renamed.status).toBe(200);
      expect((renamed.body as GroupDto).name).toBe('Вечерние');

      const deleted = await withCsrf(
        request(server()).delete(`/api/groups/${dto.id}`),
      ).set('Cookie', cookie);
      expect(deleted.status).toBe(204);

      const again = await withCsrf(request(server()).delete(`/api/groups/${dto.id}`)).set(
        'Cookie',
        cookie,
      );
      expect(again.status).toBe(404);
    });

    it('помощник и админ тоже работают с группами', async () => {
      for (const role of ['assistant', 'admin'] as const) {
        const cookie = await sessionCookieFor(testApp.app, [role]);
        const res = await postGroup(cookie, { name: uniqueName() });
        expect(res.status).toBe(201);
      }
    });

    it('POST дубля (другой регистр, пробелы) — 409 с именем существующей группы', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const first = await createGroup(cookie, 'Средние для дубля');

      const res = await postGroup(cookie, { name: '  СРЕДНИЕ ДЛЯ ДУБЛЯ ' });

      expect(res.status).toBe(409);
      expect((res.body as ApiErrorBody).code).toBe('conflict');
      expect((res.body as ApiErrorBody).message).toContain(first.name);
    });

    it('PATCH в название другой группы — 409', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const taken = await createGroup(cookie);
      const other = await createGroup(cookie);

      const res = await withCsrf(request(server()).patch(`/api/groups/${other.id}`))
        .set('Cookie', cookie)
        .send({ name: taken.name });

      expect(res.status).toBe(409);
    });

    it('PATCH и DELETE несуществующей и негодной группы — 404', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const missing = new Types.ObjectId().toString();

      for (const id of [missing, 'не-id']) {
        const patched = await withCsrf(request(server()).patch(`/api/groups/${id}`))
          .set('Cookie', cookie)
          .send({ name: 'Х' });
        const deleted = await withCsrf(request(server()).delete(`/api/groups/${id}`)).set(
          'Cookie',
          cookie,
        );
        expect([patched.status, deleted.status]).toEqual([404, 404]);
      }
    });

    it('POST с пустым и слишком длинным названием, без тела — 400', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);

      const statuses = [
        (await postGroup(cookie, { name: '   ' })).status,
        (await postGroup(cookie, { name: 'я'.repeat(61) })).status,
        (await postGroup(cookie, {})).status,
      ];

      expect(statuses).toEqual([400, 400, 400]);
    });
  });

  describe('группы у занятия', () => {
    it('создание и правка с groupIds: подпись выводится, classCount растёт и падает', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const first = await createGroup(cookie, 'Утренние');
      const second = await createGroup(cookie, 'Вечерние');

      const created = await postClass(cookie, { groupIds: [second.id, first.id] });
      expect(created.status).toBe(201);
      const cls = created.body as ClassDto;
      // Порядок — по созданию групп, а не по порядку в теле.
      expect(cls.groupIds).toEqual([first.id, second.id]);
      expect(cls.groupLabel).toBe('Утренние, Вечерние');

      const counted = (await request(server()).get('/api/groups').set('Cookie', cookie))
        .body as GroupDto[];
      expect(counted.find((g) => g.id === first.id)?.classCount).toBe(1);

      const patched = await withCsrf(request(server()).patch(`/api/classes/${cls.id}`))
        .set('Cookie', cookie)
        .send({ groupIds: [second.id] });
      expect((patched.body as ClassDto).groupLabel).toBe('Вечерние');

      const after = (await request(server()).get('/api/groups').set('Cookie', cookie))
        .body as GroupDto[];
      expect(after.find((g) => g.id === first.id)?.classCount).toBe(0);
      expect(after.find((g) => g.id === second.id)?.classCount).toBe(1);
    });

    it('переименование меняет groupLabel занятия, которое читается отдельным GET', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const group = await createGroup(cookie);
      const cls = (await postClass(cookie, { groupIds: [group.id] })).body as ClassDto;

      await withCsrf(request(server()).patch(`/api/groups/${group.id}`))
        .set('Cookie', cookie)
        .send({ name: 'Новое имя' });

      const got = await request(server())
        .get(`/api/classes/${cls.id}`)
        .set('Cookie', cookie);
      expect((got.body as ClassDto).groupLabel).toBe('Новое имя');
    });

    it('DELETE группы, которую несёт занятие — 409; после снятия — 204', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const group = await createGroup(cookie);
      const cls = (await postClass(cookie, { groupIds: [group.id] })).body as ClassDto;

      const blocked = await withCsrf(
        request(server()).delete(`/api/groups/${group.id}`),
      ).set('Cookie', cookie);
      expect(blocked.status).toBe(409);

      await withCsrf(request(server()).patch(`/api/classes/${cls.id}`))
        .set('Cookie', cookie)
        .send({ groupIds: [] });
      const freed = await withCsrf(
        request(server()).delete(`/api/groups/${group.id}`),
      ).set('Cookie', cookie);
      expect(freed.status).toBe(204);
    });

    it('неизвестная группа и не-id в groupIds — 400', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);

      const unknown = await postClass(cookie, {
        groupIds: [new Types.ObjectId().toString()],
      });
      const garbage = await postClass(cookie, { groupIds: ['не-id'] });

      expect([unknown.status, garbage.status]).toEqual([400, 400]);
    });

    // Подпись больше не пишется клиентом: вкладка со старой сборкой получает
    // 400 и предложение перезагрузиться (ADR-0101), а не молча теряет поле.
    it('groupLabel в теле — 400: подпись выводится сервером из groupIds', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);

      const res = await postClass(cookie, { groupLabel: 'средняя группа' });

      expect(res.status).toBe(400);
    });
  });
});
