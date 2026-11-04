// e2e: группы канала (ADR-0196) — `groupIds` у POST и PATCH /channels, снятие
// пустым списком, неизвестная группа, удаление канала с группой. Настоящий AppModule на
// MongoMemoryServer. Отдельный файл: channels.e2e-spec.ts уже у предела размера.
import { Types } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ChannelDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createChannelTestHelpers, MANUAL_BODY } from './e2e-support/channels-fixtures';

describe('Группа канала (e2e, ADR-0196)', () => {
  let testApp: TestApp;
  const { server, postChannel, groupModel, sessionFor } = createChannelTestHelpers(
    () => testApp,
  );

  // Тесты делят базу, а название группы уникально — к каждому добавляем id.
  async function newGroup(name: string) {
    const unique = `${name} ${new Types.ObjectId().toString()}`;
    return groupModel().create({ name: unique, nameKey: unique.toLowerCase() });
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('POST и PATCH с groupIds: группы канала читаются; [] снимает; неизвестная — 400', async () => {
    const cookie = await sessionFor(['teacher']);
    const group = await newGroup('Начинающие');
    const other = await newGroup('Старшие');
    const groupId = group._id.toString();
    const otherId = other._id.toString();

    const created = await postChannel(cookie, {
      ...MANUAL_BODY,
      groupIds: [groupId, otherId],
    });
    expect(created.status).toBe(201);
    const dto = created.body as ChannelDto;
    expect(dto.groupIds).toEqual([groupId, otherId]);

    const read = await request(server())
      .get(`/api/channels/${dto.id}`)
      .set('Cookie', cookie);
    expect((read.body as ChannelDto).groupIds).toEqual([groupId, otherId]);

    const cleared = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
      .set('Cookie', cookie)
      .send({ groupIds: [] });
    expect(cleared.status).toBe(200);
    expect((cleared.body as ChannelDto).groupIds).toEqual([]);

    const unknown = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
      .set('Cookie', cookie)
      .send({ groupIds: [new Types.ObjectId().toString()] });
    expect(unknown.status).toBe(400);
    expect((unknown.body as ApiErrorBody).message).toContain('Такой группы нет');

    const garbage = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
      .set('Cookie', cookie)
      .send({ groupIds: ['не-id'] });
    expect(garbage.status).toBe(400);
  });

  it('старое тело со списком занятий у канала не нужно: у канала нет полей занятий (400 на чужое поле)', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postChannel(cookie, MANUAL_BODY);
    const dto = created.body as ChannelDto;

    const res = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
      .set('Cookie', cookie)
      .send({ classIds: [] });

    expect(res.status).toBe(400);
  });

  it('DELETE канала с группой — 204: держать нечему, группа остаётся', async () => {
    const cookie = await sessionFor(['teacher']);
    const group = await newGroup('Средние');
    const created = await postChannel(cookie, {
      ...MANUAL_BODY,
      groupIds: [group._id.toString()],
    });
    const dto = created.body as ChannelDto;

    const res = await withCsrf(request(server()).delete(`/api/channels/${dto.id}`)).set(
      'Cookie',
      cookie,
    );

    expect(res.status).toBe(204);
    expect(await groupModel().countDocuments({ _id: group._id })).toBe(1);
  });
});
