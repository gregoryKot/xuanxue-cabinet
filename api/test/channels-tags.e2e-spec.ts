// e2e на теги канала (ADR-0108) — отбор рассылок по тегу занятия/даты:
// отдельный файл от channels.e2e-spec.ts, тот же приём, что у
// classes-tags.e2e-spec.ts/lessons-tags.e2e-spec.ts. Настоящий AppModule на
// MongoMemoryServer, TelegramClientFactory не нужна — тела запросов manual.
import request from 'supertest';
import type { ApiErrorBody, ChannelDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createChannelTestHelpers, MANUAL_BODY } from './e2e-support/channels-fixtures';

describe('Теги канала (e2e, ADR-0108)', () => {
  let testApp: TestApp;
  const { server, postChannel, sessionFor } = createChannelTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function patchChannel(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/channels/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  it('POST без tags → 201, tags — пустой массив (канал получает всё)', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postChannel(cookie, MANUAL_BODY);

    expect(res.status).toBe(201);
    expect((res.body as ChannelDto).tags).toEqual([]);
  });

  it('POST с tags → 201, нормализованы и в ответе, config наружу не утекает', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postChannel(cookie, {
      ...MANUAL_BODY,
      tags: [' Новички ', 'новички'],
    });

    expect(res.status).toBe(201);
    expect((res.body as ChannelDto).tags).toEqual(['Новички']);
    expect(res.body as Record<string, unknown>).not.toHaveProperty('config');
  });

  it('PATCH с тегами нормализует и заменяет прежний набор', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postChannel(cookie, { ...MANUAL_BODY, tags: ['раз'] });

    const patched = await patchChannel(cookie, (created.body as ChannelDto).id, {
      tags: ['Два', 'два', '  Три  '],
    });

    expect(patched.status).toBe(200);
    expect((patched.body as ChannelDto).tags).toEqual(['Два', 'Три']);
  });

  it('PATCH без tags — прежние теги остаются на месте', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postChannel(cookie, { ...MANUAL_BODY, tags: ['новички'] });

    const patched = await patchChannel(cookie, (created.body as ChannelDto).id, {
      title: 'Facebook школы',
    });

    expect(patched.status).toBe(200);
    expect((patched.body as ChannelDto).tags).toEqual(['новички']);
  });

  it('PATCH { tags: [] } → сохранил → нашёл: снимает все теги, config не утекает', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postChannel(cookie, { ...MANUAL_BODY, tags: ['новички'] });
    const dto = created.body as ChannelDto;

    const patched = await patchChannel(cookie, dto.id, { tags: [] });

    expect(patched.status).toBe(200);
    expect((patched.body as ChannelDto).tags).toEqual([]);
    expect(patched.body as Record<string, unknown>).not.toHaveProperty('config');

    const got = await request(server())
      .get(`/api/channels/${dto.id}`)
      .set('Cookie', cookie);
    expect((got.body as ChannelDto).tags).toEqual([]);
  });

  it('PATCH { tags: null } — 400 (в каналах null нигде не значит «сбросить»)', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postChannel(cookie, MANUAL_BODY);

    const res = await patchChannel(cookie, (created.body as ChannelDto).id, {
      tags: null,
    });

    expect(res.status).toBe(400);
  });

  it('POST со слишком длинным тегом — 400 invalid_input', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postChannel(cookie, { ...MANUAL_BODY, tags: ['а'.repeat(41)] });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });
});
