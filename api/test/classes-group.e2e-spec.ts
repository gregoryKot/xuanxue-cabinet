// e2e: группа занятия — единственный рычаг рассылки (ADR-0195): `groupId` и
// `forAllGroups` у POST и PATCH /classes, снятие `null`-ом, «для всех групп»,
// отказ старой вкладке с `channelIds`/`groupIds`. Настоящий AppModule на
// MongoMemoryServer. Отдельный файл: classes.e2e-spec.ts уже у предела размера.
import { Types } from 'mongoose';
import request from 'supertest';
import type { ClassDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const VALID_BODY = { title: 'Тайцзицюань', format: 'online' as const };

describe('Группа занятия (e2e, ADR-0195)', () => {
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

  function postClass(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchClass(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/classes/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  const sessionFor = (): Promise<string> => sessionCookieFor(testApp.app, ['teacher']);

  it('старая вкладка с channelIds, groupId или forAllGroups — 400, занятие не создано и не изменено (ADR-0196)', async () => {
    const cookie = await sessionFor();
    const created = await postClass(cookie, VALID_BODY);
    const dto = created.body as ClassDto;
    const before = (await request(server()).get('/api/classes').set('Cookie', cookie))
      .body as ClassDto[];

    const statuses = [
      (await postClass(cookie, { ...VALID_BODY, channelIds: [] })).status,
      (await postClass(cookie, { ...VALID_BODY, forAllGroups: true })).status,
      (await postClass(cookie, { ...VALID_BODY, groupId: null })).status,
      (await patchClass(cookie, dto.id, { forAllGroups: false })).status,
      (await patchClass(cookie, dto.id, { groupId: null })).status,
    ];

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
    const after = (await request(server()).get('/api/classes').set('Cookie', cookie))
      .body as ClassDto[];
    expect(after).toHaveLength(before.length);
  });

  it('POST /classes без групп — groupIds: [], подпись пустая, в ответе нет channelIds', async () => {
    const cookie = await sessionFor();

    const res = await postClass(cookie, VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ groupIds: [], groupLabel: '' });
    expect(res.body as Record<string, unknown>).not.toHaveProperty('channelIds');
  });

  it('несколько групп: создание, замена, снятие пустым списком; неизвестная группа и негодный id — 400', async () => {
    const cookie = await sessionFor();
    async function newGroup(name: string): Promise<string> {
      const group = await withCsrf(request(server()).post('/api/groups'))
        .set('Cookie', cookie)
        .send({ name: `${name} ${new Types.ObjectId().toString()}` });
      return (group.body as { id: string }).id;
    }
    const first = await newGroup('Первая');
    const second = await newGroup('Вторая');
    const created = await postClass(cookie, { ...VALID_BODY, groupIds: [second, first] });
    const dto = created.body as ClassDto;
    expect(dto.groupIds).toEqual([first, second]);

    const replaced = await patchClass(cookie, dto.id, { groupIds: [second] });
    expect((replaced.body as ClassDto).groupIds).toEqual([second]);
    const cleared = await patchClass(cookie, dto.id, { groupIds: [] });
    expect((cleared.body as ClassDto).groupIds).toEqual([]);
    const unknown = await patchClass(cookie, dto.id, {
      groupIds: [new Types.ObjectId().toString()],
    });
    const garbage = await patchClass(cookie, dto.id, { groupIds: ['не-id'] });

    expect([replaced.status, cleared.status, unknown.status, garbage.status]).toEqual([
      200, 200, 400, 400,
    ]);
  });
});
