// e2e: у канала больше нет тегов (ADR-0192, снимали ADR-0108). Глобальный
// ValidationPipe работает с `forbidNonWhitelisted: true` (app.setup.ts), поэтому
// запрос старой вкладки с `tags` получает 400 «поле не поддерживается», а не тихо
// отброшенное поле, и в базу ничего не пишется. Настоящий AppModule на
// MongoMemoryServer, тела запросов manual.
import request from 'supertest';
import type { ApiErrorBody, ChannelDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createChannelTestHelpers, MANUAL_BODY } from './e2e-support/channels-fixtures';

describe('Теги канала убраны (e2e, ADR-0192)', () => {
  let testApp: TestApp;
  const { server, postChannel, channelModel, sessionFor } = createChannelTestHelpers(
    () => testApp,
  );

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

  it('POST с tags от старой вкладки — 400 invalid_input, канал не создан', async () => {
    const cookie = await sessionFor(['teacher']);
    const before = await channelModel().countDocuments({});

    const res = await postChannel(cookie, { ...MANUAL_BODY, tags: ['новички'] });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    await expect(channelModel().countDocuments({})).resolves.toBe(before);
  });

  it('PATCH с tags от старой вкладки — 400, название не изменилось (read-after-write)', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postChannel(cookie, MANUAL_BODY);
    const { id } = created.body as ChannelDto;

    const patched = await patchChannel(cookie, id, {
      title: 'Facebook школы',
      tags: ['средние'],
    });

    expect(patched.status).toBe(400);
    const got = await request(server()).get(`/api/channels/${id}`).set('Cookie', cookie);
    expect((got.body as ChannelDto).title).toBe(MANUAL_BODY.title);
    expect(got.body as Record<string, unknown>).not.toHaveProperty('tags');
  });
});
