// Общие константы окна, тела запросов, HTTP-хелперы и модели для
// lessons.e2e-spec.ts и lessons-broadcast-status.e2e-spec.ts — вынесено,
// чтобы оба спека уместились в лимит файл-храповика (CLAUDE.md «Храповики»),
// без дублей (jscpd), как channels-fixtures.ts для channels.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import request from 'supertest';
import type { UserRole } from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../../src/classes/class.schema';
import { BroadcastRecord } from '../../src/broadcasts/broadcast.schema';
import { ChannelRecord } from '../../src/channels/channel.schema';
import { DeliveryRecord } from '../../src/deliveries/delivery.schema';
import { LessonRecord } from '../../src/lessons/lesson.schema';
import { encryptRecord } from '../../src/utils/encryption';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

export const FROM = '2026-09-01T00:00:00Z';
export const TO = '2026-09-08T00:00:00Z';
export const STARTS_AT = '2026-09-03T16:00:00Z';

/** Запись у даты занятия. С ADR-0114 занятие без записи не попадает в архив
 * ученика, и спекам архива приходится заводить её каждой дате — блок был бы
 * одинаковым в двух файлах, поэтому живёт здесь (CLAUDE.md «Одна механика —
 * один компонент»). Статус проверяет вызывающий: у него есть `expect`. */
export function postRecording(
  server: ReturnType<TestApp['app']['getHttpServer']>,
  cookie: string,
  lessonId: string,
  url: string,
): request.Test {
  return withCsrf(request(server).post(`/api/lessons/${lessonId}/recording`))
    .set('Cookie', cookie)
    .send({ title: 'Запись занятия', url });
}

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
  const channelModel = (): Model<ChannelRecord> =>
    getApp().app.get(getModelToken(ChannelRecord.name), { strict: false });
  const deliveryModel = (): Model<DeliveryRecord> =>
    getApp().app.get(getModelToken(DeliveryRecord.name), { strict: false });

  // `zoomLink`/`channelIds` — только send-now.e2e-spec.ts (нужен реально
  // рассылаемый класс: ссылка и активный канал), остальные вызовы этого
  // хелпера их не передают и получают прежнее поведение без изменений.
  // `zoomLink` пишем через encryptRecord — как и прод-код (ClassesService),
  // не открытым текстом: test/jest-e2e.config.js подключает test/jest.setup.ts
  // в setupFiles, ENCRYPTION_KEY стоит в process.env раньше любого импорта
  // src/**, поэтому utils/encryption.ts кэширует настоящий ключ, а не пустой.
  async function createClass(
    overrides: {
      rulesDurationMin?: number;
      zoomLink?: string;
      channelIds?: Types.ObjectId[];
    } = {},
  ): Promise<string> {
    const { rulesDurationMin = 45, zoomLink, channelIds } = overrides;
    const cls = await classModel().create(
      encryptRecord(
        {
          title: 'Тайцзицюань',
          format: 'online',
          rules: [{ weekday: 4, time: '19:00', durationMin: rulesDurationMin }],
          zoomLink,
          channelIds,
        },
        CLASS_ENCRYPT_SCHEMA,
      ),
    );
    return cls._id.toString();
  }

  /** Класс с реальной ссылкой и активным каналом — send-now.e2e-spec.ts
   * (нужен класс, куда реально можно отправить). */
  async function createSendableClass(): Promise<string> {
    const channel = await channelModel().create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: '',
      active: true,
    });
    return createClass({
      zoomLink: 'https://zoom.example/1',
      channelIds: [channel._id],
    });
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
    channelModel,
    deliveryModel,
    createClass,
    createSendableClass,
    postLesson,
    patchLesson,
  };
}
