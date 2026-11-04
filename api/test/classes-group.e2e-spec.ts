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

  it('старая вкладка с channelIds или groupIds — 400, занятие не создано и не изменено (ADR-0195)', async () => {
    const cookie = await sessionFor();
    const created = await postClass(cookie, VALID_BODY);
    const dto = created.body as ClassDto;
    const before = (await request(server()).get('/api/classes').set('Cookie', cookie))
      .body as ClassDto[];

    const create = await postClass(cookie, { ...VALID_BODY, channelIds: [] });
    const patch = await patchClass(cookie, dto.id, { groupIds: [] });

    expect(create.status).toBe(400);
    expect(patch.status).toBe(400);
    const after = (await request(server()).get('/api/classes').set('Cookie', cookie))
      .body as ClassDto[];
    expect(after).toHaveLength(before.length);
  });

  it('POST /classes без группы — groupId: null, forAllGroups: false, в ответе нет channelIds', async () => {
    const cookie = await sessionFor();

    const res = await postClass(cookie, VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      groupId: null,
      forAllGroups: false,
      groupLabel: '',
    });
    expect(res.body as Record<string, unknown>).not.toHaveProperty('channelIds');
  });

  it('PATCH groupId: null снимает группу; неизвестная группа и негодный id — 400', async () => {
    const cookie = await sessionFor();
    const group = await withCsrf(request(server()).post('/api/groups'))
      .set('Cookie', cookie)
      .send({ name: `Группа ${Date.now()}` });
    const groupId = (group.body as { id: string }).id;
    const created = await postClass(cookie, { ...VALID_BODY, groupId });
    const dto = created.body as ClassDto;
    expect(dto.groupId).toBe(groupId);

    const cleared = await patchClass(cookie, dto.id, { groupId: null });
    expect((cleared.body as ClassDto).groupId).toBeNull();
    const unknown = await patchClass(cookie, dto.id, {
      groupId: new Types.ObjectId().toString(),
    });
    const garbage = await patchClass(cookie, dto.id, { groupId: 'не-id' });

    expect([cleared.status, unknown.status, garbage.status]).toEqual([200, 400, 400]);
  });

  it('PATCH forAllGroups: true — подпись «все группы», groupId снят; потом группа возвращает', async () => {
    const cookie = await sessionFor();
    const group = await withCsrf(request(server()).post('/api/groups'))
      .set('Cookie', cookie)
      .send({ name: `Группа ${Date.now()}` });
    const groupId = (group.body as { id: string }).id;
    const created = await postClass(cookie, { ...VALID_BODY, groupId });
    const dto = created.body as ClassDto;

    const all = await patchClass(cookie, dto.id, { forAllGroups: true });
    const back = await patchClass(cookie, dto.id, { groupId });

    expect(all.body).toMatchObject({
      groupId: null,
      forAllGroups: true,
      groupLabel: 'все группы',
    });
    expect(back.body).toMatchObject({ groupId, forAllGroups: false });
  });
});
