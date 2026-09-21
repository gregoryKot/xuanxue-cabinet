// e2e на /settings — шаблоны школы (docs/PLAN.md §6 «Шаблоны»). Данные школы
// (ADR-0010): доступ по роли, не по владельцу (e2e-support/README.md).
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import type {
  ApiErrorBody,
  PreviewTemplateResult,
  SettingsDto,
  UserRole,
} from '@xuanxue/shared';
import { DEFAULT_PREVIEW_MINUTES, DEFAULT_TEMPLATES } from '@xuanxue/shared';
import { ClassRecord } from '../src/classes/class.schema';
import { LessonRecord } from '../src/lessons/lesson.schema';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Settings (e2e)', () => {
  let testApp: TestApp;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let settingsModel: Model<SettingsRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    classModel = testApp.app.get<Model<ClassRecord>>(getModelToken(ClassRecord.name), {
      strict: false,
    });
    lessonModel = testApp.app.get<Model<LessonRecord>>(getModelToken(LessonRecord.name), {
      strict: false,
    });
    settingsModel = testApp.app.get<Model<SettingsRecord>>(
      getModelToken(SettingsRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await classModel.deleteMany({});
    await lessonModel.deleteMany({});
    // PATCH-тесты меняют документ школы (_id фиксирован) — без очистки
    // следующий тест увидел бы чужой шаблон вместо дефолта (CLAUDE.md
    // «Тесты»: тесты не должны зависеть от порядка друг друга).
    await settingsModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  it('GET /settings без cookie — 401; ученик — 403', async () => {
    const anon = await request(server()).get('/api/settings');
    expect(anon.status).toBe(401);

    const cookie = await sessionFor([]);
    const res = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('GET /settings — дефолтные шаблоны школы', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await request(server()).get('/api/settings').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const dto = res.body as SettingsDto;
    expect(dto.templates.lesson_link).toBe(DEFAULT_TEMPLATES.lesson_link);
    expect(dto.tz).toBe('Asia/Jerusalem');
    expect(dto.previewMinutes).toBe(DEFAULT_PREVIEW_MINUTES);
  });

  describe('PATCH previewMinutes', () => {
    it('валидное значение — GET после видит его (read-after-write)', async () => {
      const cookie = await sessionFor(['teacher']);

      const patched = await withCsrf(request(server()).patch('/api/settings'))
        .set('Cookie', cookie)
        .send({ previewMinutes: 10 });
      expect(patched.status).toBe(200);
      expect((patched.body as SettingsDto).previewMinutes).toBe(10);

      const got = await request(server()).get('/api/settings').set('Cookie', cookie);
      expect((got.body as SettingsDto).previewMinutes).toBe(10);
    });

    // 0/1441 — за границей SETTINGS_LIMITS; 5.5 — не целое; null — не в
    // NULLABLE_SETTINGS_FIELDS (сбрасывать previewMinutes нечем не в тему,
    // это не адрес сайта): все четыре 400, ничего не сохраняется.
    it.each([0, 1441, 5.5, null])('%s — 400, ничего не сохраняется', async (value) => {
      const cookie = await sessionFor(['teacher']);

      const res = await withCsrf(request(server()).patch('/api/settings'))
        .set('Cookie', cookie)
        .send({ previewMinutes: value });

      expect(res.status).toBe(400);
      const got = await request(server()).get('/api/settings').set('Cookie', cookie);
      expect((got.body as SettingsDto).previewMinutes).toBe(DEFAULT_PREVIEW_MINUTES);
    });
  });

  // Экран «Шаблоны» кладёт тело ответа PATCH прямо на себя, без GET следом
  // (ADR-0087), поэтому неполный ответ — не «на одно поле меньше», а белый
  // экран у учителя: settings.templates упадёт при рендере. Тела сверяются
  // целиком — новое поле SettingsDto попадёт под гейт без правки теста.
  it('PATCH /settings — тело ответа равно телу GET сразу после (ADR-0087)', async () => {
    const cookie = await sessionFor(['teacher']);

    const patched = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({
        previewMinutes: 25,
        templates: { recording: 'Запись готова: {название}' },
      });
    expect(patched.status).toBe(200);

    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(patched.body).toEqual(got.body);
  });

  it('PATCH с неизвестной подстановкой — 400 с текстом в конверте', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ templates: { recording: 'Вела {фамилия}' } });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toContain('{фамилия}');
  });

  it('PATCH валидный — GET после видит новый текст', async () => {
    const cookie = await sessionFor(['teacher']);

    const patched = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ templates: { recording: 'Запись: {название}' } });
    expect(patched.status).toBe(200);

    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).templates.recording).toBe('Запись: {название}');
  });

  it('PATCH пустым шаблоном — 400, GET после видит дефолт (ничего не сохранилось)', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ templates: { recording: '   \n  ' } });

    expect(res.status).toBe(400);
    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).templates.recording).toBe(
      DEFAULT_TEMPLATES.recording,
    );
  });

  it('PATCH schoolSiteUrl — GET после видит адрес (read-after-write)', async () => {
    const cookie = await sessionFor(['teacher']);

    const patched = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ schoolSiteUrl: 'https://xuanxue.su' });
    expect(patched.status).toBe(200);
    expect((patched.body as SettingsDto).schoolSiteUrl).toBe('https://xuanxue.su');

    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).schoolSiteUrl).toBe('https://xuanxue.su');
  });

  it('PATCH schoolSiteUrl: null снимает адрес — GET после видит, что поля нет', async () => {
    const cookie = await sessionFor(['teacher']);
    await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ schoolSiteUrl: 'https://xuanxue.su' });

    const patched = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ schoolSiteUrl: null });
    expect(patched.status).toBe(200);
    expect((patched.body as SettingsDto).schoolSiteUrl).toBeUndefined();

    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).schoolSiteUrl).toBeUndefined();
  });

  it('PATCH schoolSiteUrl без https:// — 400 по-русски, ничего не сохранилось', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ schoolSiteUrl: 'http://xuanxue.su' });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).details).toEqual(
      expect.arrayContaining(['Адрес сайта школы: должна начинаться с https://.']),
    );

    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).schoolSiteUrl).toBeUndefined();
  });

  it('PATCH { templates: {} } — 200, updatedAt не двигается (ничего не пишет)', async () => {
    const cookie = await sessionFor(['teacher']);
    const before = (await request(server()).get('/api/settings').set('Cookie', cookie))
      .body as SettingsDto;

    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ templates: {} });

    expect(res.status).toBe(200);
    expect((res.body as SettingsDto).updatedAt).toBe(before.updatedAt);
  });

  describe('POST /settings/preview', () => {
    async function seedLesson(): Promise<string> {
      const cls = await classModel.create({
        title: 'Цигун для глаз',
        groupLabel: '',
        format: 'online',
        zoomLink: 'https://zoom.example/1',
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
        active: true,
        channelIds: [],
      });
      const lesson = await lessonModel.create({
        classId: cls._id,
        startsAt: DateTime.utc().plus({ minutes: 20 }).toJSDate(),
        durationMin: 60,
        topic: 'Пятое занятие',
        status: 'scheduled',
      });
      return lesson._id.toString();
    }

    it('рендерит текст с подставленным названием', async () => {
      const cookie = await sessionFor(['teacher']);
      const lessonId = await seedLesson();

      const res = await withCsrf(request(server()).post('/api/settings/preview'))
        .set('Cookie', cookie)
        .send({ kind: 'lesson_link', lessonId });

      expect(res.status).toBe(200);
      expect((res.body as PreviewTemplateResult).text).toContain('Цигун для глаз');
    });

    it('занятие без класса — 404', async () => {
      const cookie = await sessionFor(['teacher']);
      const lesson = await lessonModel.create({
        classId: '507f1f77bcf86cd799439011',
        startsAt: DateTime.utc().plus({ minutes: 20 }).toJSDate(),
        durationMin: 60,
        status: 'scheduled',
      });

      const res = await withCsrf(request(server()).post('/api/settings/preview'))
        .set('Cookie', cookie)
        .send({ kind: 'lesson_link', lessonId: lesson._id.toString() });

      expect(res.status).toBe(404);
    });
  });

  it('админ: GET /settings — 200 (роль школы, не владение)', async () => {
    const cookie = await sessionFor(['admin']);
    const res = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
