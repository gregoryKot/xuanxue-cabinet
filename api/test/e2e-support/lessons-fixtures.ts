// Общие константы окна, тела запросов, HTTP-хелперы и модели для
// lessons.e2e-spec.ts и lessons-broadcast-status.e2e-spec.ts — вынесено,
// чтобы оба спека уместились в лимит файл-храповика (CLAUDE.md «Храповики»),
// без дублей (jscpd), как channels-fixtures.ts для channels.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import request from 'supertest';
import type { UserRole } from '@xuanxue/shared';
import { BroadcastRecord } from '../../src/broadcasts/broadcast.schema';
import { ClassRecord } from '../../src/classes/class.schema';
import { LessonRecord } from '../../src/lessons/lesson.schema';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

export const FROM = '2026-09-01T00:00:00Z';
export const TO = '2026-09-08T00:00:00Z';
export const STARTS_AT = '2026-09-03T16:00:00Z';

/** `getApp` — геттер, не значение: как в channels-fixtures.ts — вызывается
 * лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createLessonTestHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const classModel = (): Model<ClassRecord> =>
    getApp().app.get(getModelToken(ClassRecord.name), { strict: false });
  const lessonModel = (): Model<LessonRecord> =>
    getApp().app.get(getModelToken(LessonRecord.name), { strict: false });
  const broadcastModel = (): Model<BroadcastRecord> =>
    getApp().app.get(getModelToken(BroadcastRecord.name), { strict: false });

  // `zoomLink`/`channelIds` — только send-now.e2e-spec.ts (нужен реально
  // рассылаемый класс: ссылка и активный канал), остальные вызовы этого
  // хелпера их не передают и получают прежнее поведение без изменений.
  // Пишем `zoomLink` как есть, БЕЗ encryptRecord: `encryptRecord`/`encrypt`
  // живут в `utils/encryption.ts`, который читает `ENCRYPTION_KEY` один раз
  // при импорте модуля (`loadKeys()` на верхнем уровне файла) — статический
  // import отсюда исполнился бы до `setTestEnv()` в createTestApp() (этот
  // файл импортируется до `beforeAll`) и навсегда закэшировал бы пустой ключ
  // для всего e2e-приложения (create-app.ts объясняет тот же приём для
  // AppModule). `decrypt()` сам понимает лёгаси-открытый текст и возвращает
  // его как есть (utils/encryption.ts) — рассылке этого достаточно, тест не
  // про шифрование класса (оно уже проверено в classes.e2e-spec.ts).
  async function createClass(
    overrides: {
      rulesDurationMin?: number;
      zoomLink?: string;
      channelIds?: Types.ObjectId[];
    } = {},
  ): Promise<string> {
    const { rulesDurationMin = 45, zoomLink, channelIds } = overrides;
    const cls = await classModel().create({
      title: 'Тайцзицюань',
      format: 'online',
      rules: [{ weekday: 4, time: '19:00', durationMin: rulesDurationMin }],
      zoomLink,
      channelIds,
    });
    return cls._id.toString();
  }

  function postLesson(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/lessons'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchLesson(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/lessons/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  return {
    server,
    sessionFor: (roles: UserRole[]): Promise<string> =>
      sessionCookieFor(getApp().app, roles),
    classModel,
    lessonModel,
    broadcastModel,
    createClass,
    postLesson,
    patchLesson,
  };
}
