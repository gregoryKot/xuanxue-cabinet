// e2e повторной отправки видео экзамена учителю (ADR-0088, уточняет
// ADR-0023): кнопка «Прислать мне в бота» на карточке проверки. Настоящий
// AppModule на MongoMemoryServer, TELEGRAF_FACTORY подменена
// (createFakeTelegrafFactory) — сеть не трогаем, тот же приём, что
// telegram-webhook.e2e-spec.ts (образец — api/test/exam-media.e2e-spec.ts,
// e2e-support/README.md). Выбор метода Bot API по типу и перебор без него —
// юнит telegram-exam-video-delivery.spec.ts, здесь только HTTP-контракт: роль,
// отказ без активного личного чата, успех, отсутствие fileId в ответе.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import { EXAM_MEDIA_NO_BOT_CHAT_MESSAGE, type ApiErrorBody } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import { insertMediaAsset } from '../src/media/media-asset-insert';
import { MediaAssetRecord } from '../src/media/media-asset.schema';
import {
  createFakeTelegrafFactory,
  type FakeTelegraf,
} from '../src/telegram/test-support/telegraf-factory';
import { TELEGRAF_FACTORY } from '../src/telegram/telegraf-instance';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Повторная отправка видео экзамена учителю (e2e, ADR-0088)', () => {
  let testApp: TestApp;
  let fake: FakeTelegraf;
  const { server, startedAttempt } = createExamMediaTestHelpers(() => testApp);

  beforeAll(async () => {
    fake = createFakeTelegrafFactory();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(TELEGRAF_FACTORY).useValue(fake.factory);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function mediaModel(): Model<MediaAssetRecord> {
    return testApp.app.get(getModelToken(MediaAssetRecord.name), { strict: false });
  }

  function channelModel(): Model<ChannelRecord> {
    return testApp.app.get(getModelToken(ChannelRecord.name), { strict: false });
  }

  async function seedTelegramMedia(attemptId: string, userId: string): Promise<string> {
    const dto = await insertMediaAsset(mediaModel(), {
      attemptId,
      userId,
      kind: 'telegram',
      fileId: 'BgADBAADrwAD-e2e-file-id',
      fileUniqueId: 'AgADrwAD-e2e-unique',
      telegramType: 'video',
      receivedAt: DateTime.utc(),
    });
    return dto.id;
  }

  async function connectBot(telegramId: number): Promise<void> {
    await channelModel().create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: String(telegramId),
      active: true,
    });
  }

  it('ученику (без ролей) — 403', async () => {
    const { userId, cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attemptId = await startedAttempt(studentCookie);
    const mediaId = await seedTelegramMedia(attemptId, userId);

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/${mediaId}/send-to-me`),
    ).set('Cookie', studentCookie);

    expect(res.status).toBe(403);
  });

  it('учитель без активного личного чата с ботом — 409 с русским текстом, Telegram не звался', async () => {
    const { userId: studentId, cookie: studentCookie } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик', roles: [] },
    );
    const attemptId = await startedAttempt(studentCookie);
    const mediaId = await seedTelegramMedia(attemptId, studentId);
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/${mediaId}/send-to-me`),
    ).set('Cookie', teacherCookie);

    expect(res.status).toBe(409);
    const body = res.body as ApiErrorBody;
    expect(body.message).toBe(EXAM_MEDIA_NO_BOT_CHAT_MESSAGE);
    expect(fake.sendVideoCalls).toEqual([]);
  });

  it('учитель с активным личным чатом — 204, порт получил вызов, fileId в ответе нет', async () => {
    const { userId: studentId, cookie: studentCookie } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик', roles: [] },
    );
    const attemptId = await startedAttempt(studentCookie);
    const mediaId = await seedTelegramMedia(attemptId, studentId);
    const teacherTelegramId = 660_701;
    const { cookie: teacherCookie } = await createUserWithSession(testApp.app, {
      name: 'Мария',
      roles: ['teacher'],
      telegramId: teacherTelegramId,
    });
    await connectBot(teacherTelegramId);

    const res = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/media/${mediaId}/send-to-me`),
    ).set('Cookie', teacherCookie);

    expect(res.status).toBe(204);
    expect(JSON.stringify(res.body ?? {})).not.toContain('fileId');
    expect(JSON.stringify(res.body ?? {})).not.toContain('fileUniqueId');
    expect(fake.sendVideoCalls).toEqual([
      { chatId: String(teacherTelegramId), video: 'BgADBAADrwAD-e2e-file-id' },
    ]);
    // Подпись — отдельным сообщением (video_note подписи не поддерживает,
    // telegram-exam-video-delivery.ts).
    expect(fake.sendMessageCalls.map((m) => m.chatId)).toContain(
      String(teacherTelegramId),
    );
  });
});
