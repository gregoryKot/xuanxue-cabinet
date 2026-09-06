// Общие тела запросов и HTTP-хелперы для channels.e2e-spec.ts — вынесено,
// чтобы сам спек уместился в лимит 300 строк (CLAUDE.md «Храповики»).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord } from '../../src/channels/channel.schema';
import { ClassRecord } from '../../src/classes/class.schema';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

export const MANUAL_BODY = { type: 'manual' as const, title: 'Facebook', config: {} };
export const FAILING_CHAT_ID = '@fails';

// chatId у каждого вызова свой: уникальный индекс (type, target) не даёт
// двум telegram-каналам одного прогона (без очистки БД между it()) занять
// один и тот же адрес — тесты создают отдельные каналы, а не делят один.
let telegramSeq = 0;
export function telegramBody(chatId = `@school-${++telegramSeq}`): {
  type: 'telegram';
  title: string;
  config: { chatId: string };
} {
  return { type: 'telegram', title: 'Основной канал', config: { chatId } };
}

/** `getApp` — геттер, не значение: вызывается лениво из `it()`, когда
 * `beforeAll` уже присвоил testApp (на момент вызова этой фабрики в теле
 * describe() приложение ещё не поднято). */
export function createChannelTestHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();

  return {
    server,
    postChannel: (cookie: string, body: Record<string, unknown>): request.Test =>
      withCsrf(request(server()).post('/api/channels')).set('Cookie', cookie).send(body),
    channelModel: (): Model<ChannelRecord> =>
      getApp().app.get(getModelToken(ChannelRecord.name), { strict: false }),
    classModel: (): Model<ClassRecord> =>
      getApp().app.get(getModelToken(ClassRecord.name), { strict: false }),
    sessionFor: (roles: UserRole[]): Promise<string> =>
      sessionCookieFor(getApp().app, roles),
  };
}
