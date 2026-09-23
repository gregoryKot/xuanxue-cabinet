// e2e на роль GET /api/tags (ADR-0075, ADR-0078) — доступ роли, не владельца
// (данные школы, ADR-0010), тот же приём, что summary.e2e-spec.ts. Подсчёт
// по всей истории, наследование тега курса и лимит уже проверены против
// настоящей Mongo в tags.service.spec.ts — здесь только то, что HTTP отдаёт
// по роли и что модуль действительно подключён (реальный AppModule, не
// `new TagsService(...)` напрямую).
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { TagSummaryDto } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { MaterialRecord } from '../src/materials/material.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';

describe('Сводка тегов (e2e, GET /api/tags)', () => {
  let testApp: TestApp;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let materialModel: Model<MaterialRecord>;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    lessonModel = testApp.app.get<Model<LessonRecord>>(getModelToken(LessonRecord.name), {
      strict: false,
    });
    classModel = testApp.app.get<Model<ClassRecord>>(getModelToken(ClassRecord.name), {
      strict: false,
    });
    materialModel = testApp.app.get<Model<MaterialRecord>>(
      getModelToken(MaterialRecord.name),
      { strict: false },
    );
    channelModel = testApp.app.get<Model<ChannelRecord>>(
      getModelToken(ChannelRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await Promise.all([
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
      materialModel.deleteMany({}),
      channelModel.deleteMany({}),
    ]);
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('без cookie — 401; ученик — 403', async () => {
    const anon = await request(server()).get('/api/tags');
    expect(anon.status).toBe(401);

    const cookie = await sessionCookieFor(testApp.app, []);
    const res = await request(server()).get('/api/tags').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('штат школы (teacher/assistant/admin) получает сводку — пустая база, пустой список', async () => {
    for (const role of ['teacher', 'assistant', 'admin'] as const) {
      const cookie = await sessionCookieFor(testApp.app, [role]);

      const res = await request(server()).get('/api/tags').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body as TagSummaryDto[]).toEqual([]);
    }
  });

  it('материал, дата занятия и канал с тегом — сводка считает все три источника через реально подключённый модуль (ADR-0108, ADR-0116)', async () => {
    const cls = await classModel.create({ title: 'Курс', format: 'online' });
    await lessonModel.create({
      classId: cls._id,
      startsAt: new Date('2026-09-03T16:00:00Z'),
      durationMin: 60,
      tags: ['дракон'],
    });
    await materialModel.create({
      title: 'Материал',
      url: 'https://example.com/x',
      kind: 'article',
      createdBy: new Types.ObjectId(),
      tags: ['дракон'],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: new Types.ObjectId().toString(),
      active: true,
      tags: ['дракон'],
    });

    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const res = await request(server()).get('/api/tags').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const dto = (res.body as TagSummaryDto[]).find((t) => t.tag === 'дракон');
    expect(dto).toEqual({
      tag: 'дракон',
      lessonCount: 1,
      materialCount: 1,
      channelCount: 1,
    });
  });
});
