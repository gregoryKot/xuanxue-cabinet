// e2e read-after-write на botChatActive (ADR-0042, CLAUDE.md «Read-after-write»):
// пишем в одном месте (channels), показываем в другом (GET /auth/me) — до
// активного личного канала признак false, после — true, без повторного входа.
// Отдельный файл, не auth.e2e-spec.ts: тот уже на границе файл-храповика
// (150 строк, scripts/check-file-size-ratchet.mjs), дальше не растёт.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { MeDto } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';

describe('botChatActive в GET /auth/me (e2e)', () => {
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

  function channelModel(): Model<ChannelRecord> {
    return testApp.app.get(getModelToken(ChannelRecord.name), { strict: false });
  }

  it('telegramId есть, канала нет — false; после активного канала — true', async () => {
    const telegramId = 700_501;
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Вошла через Telegram',
      roles: ['teacher'],
      telegramId,
    });

    const before = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(before.status).toBe(200);
    // telegramId уже есть (вход через виджет), но /start в боте не нажат —
    // ровно та группа риска из ADR-0042, на которую telegramLinked молчит.
    expect((before.body as MeDto).telegramLinked).toBe(true);
    expect((before.body as MeDto).botChatActive).toBe(false);

    await channelModel().create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: String(telegramId),
      active: true,
    });

    const after = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect((after.body as MeDto).botChatActive).toBe(true);
  });
});
