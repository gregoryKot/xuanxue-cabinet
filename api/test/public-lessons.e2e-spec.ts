// e2e на GET /public/lessons (ADR-0170, контракт Workshop public-lessons.md):
// публичное расписание школы без Zoom, два режима выборки. Настоящий AppModule
// на MongoMemoryServer. Часы заморожены через Settings.now Luxon (CLAUDE.md
// «Детерминизм»): контроллер берёт `DateTime.utc()`. Ошибки запроса и 500 —
// в public-lessons-validation.e2e-spec.ts.
import { Settings } from 'luxon';
import type { MyLessonDto, PublicLessonDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';
import {
  contractLessonId,
  createPublicLessonHelpers,
  PUBLIC_LESSONS_PATH,
  ZOOM_LINK,
} from './e2e-support/public-lessons-fixtures';
import request from 'supertest';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const HOUR_MS = 3_600_000;
const CONTRACT_KEYS = [
  'classId',
  'classTitle',
  'durationMin',
  'format',
  'groupLabel',
  'id',
  'location',
  'startsAt',
  'status',
  'tags',
  'topic',
].sort();
const WINDOW_QUERY = 'from=2026-10-05T00:00:00%2B03:00&to=2026-10-19T00:00:00%2B03:00';

describe('GET /public/lessons (e2e)', () => {
  let testApp: TestApp;
  const h = createPublicLessonHelpers(() => testApp);
  const realNow = Settings.now;

  beforeAll(async () => {
    Settings.now = () => NOW.getTime();
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    Settings.now = realNow;
    await testApp.close();
  });

  afterEach(h.clearAll);

  async function listIds(query: string): Promise<string[]> {
    const res = await h.getPublic(query);
    expect(res.status).toBe(200);
    return (res.body as PublicLessonDto[]).map((l) => l.id);
  }

  describe('форма ответа', () => {
    it('без сессии — 200, голый массив, поля ровно по контракту', async () => {
      const classId = await h.createClass({ location: 'Тель-Авив' });
      await h.createLesson({
        classId,
        startsAt: new Date(NOW.getTime() + HOUR_MS),
        tags: ['дракон'],
      });

      const res = await h.getPublic();

      expect(res.status).toBe(200);
      const body = res.body as PublicLessonDto[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      const [item] = body;
      expect(Object.keys(item ?? {}).sort()).toEqual(CONTRACT_KEYS);
      expect(item).toMatchObject({
        classId: classId.toString(),
        startsAt: '2026-10-05T11:00:00.000Z',
        durationMin: 60,
        classTitle: 'Tai chi',
        groupLabel: 'School',
        format: 'both',
        location: 'Тель-Авив',
        topic: 'Practice',
        status: 'scheduled',
        tags: ['дракон'],
      });
    });

    it('занятие без тегов — tags: [], класс без адреса — ключа location нет', async () => {
      const classId = await h.createClass();
      await h.createLesson({ classId, startsAt: new Date(NOW.getTime() + HOUR_MS) });

      const [item] = (await h.getPublic()).body as PublicLessonDto[];

      expect(item?.tags).toEqual([]);
      expect(item).not.toHaveProperty('location');
      expect(Object.keys(item ?? {})).toHaveLength(CONTRACT_KEYS.length - 1);
    });

    it('два занятия одного класса — один classId, разные id', async () => {
      const classId = await h.createClass();
      await h.createLesson({ classId, startsAt: new Date(NOW.getTime() + HOUR_MS) });
      await h.createLesson({ classId, startsAt: new Date(NOW.getTime() + 2 * HOUR_MS) });

      const body = (await h.getPublic()).body as PublicLessonDto[];

      expect(body).toHaveLength(2);
      expect(body[0]?.classId).toBe(body[1]?.classId);
      expect(body[0]?.id).not.toBe(body[1]?.id);
    });
  });

  describe('проекция без Zoom', () => {
    async function expectNoZoom(cookie?: string): Promise<void> {
      const classId = await h.createClass({ location: 'Зал' });
      await h.createLesson({
        classId,
        startsAt: new Date(NOW.getTime() + HOUR_MS),
        withZoomOverride: true,
      });

      const res = await h.getPublic('', cookie);

      expect(res.status).toBe(200);
      const [item] = res.body as PublicLessonDto[];
      expect(Object.keys(item ?? {}).sort()).toEqual(CONTRACT_KEYS);
      expect(item).not.toHaveProperty('zoomLink');
      expect(item).not.toHaveProperty('zoomPassword');
      expect(item).not.toHaveProperty('zoomLinkOverride');
      // Текст целиком: ни ключа, ни значения секрета, ни под другим именем.
      expect(res.text).not.toMatch(/zoom/i);
      expect(res.text).not.toContain('секрет');
    }

    it('без сессии у класса и занятия с Zoom — ни ссылки, ни пароля', async () => {
      await expectNoZoom();
    });

    it('с сессией admin ответ тот же — сессия проекцию не расширяет', async () => {
      await expectNoZoom(await sessionCookieFor(testApp.app, ['admin']));
    });
  });

  describe('режим «ближайшие»', () => {
    it('по умолчанию — 10 из 12 будущих, по возрастанию startsAt', async () => {
      const classId = await h.createClass();
      await h.createLessonsEveryMinute(classId, new Date(NOW.getTime() + HOUR_MS), 12);

      const body = (await h.getPublic()).body as PublicLessonDto[];

      expect(body).toHaveLength(10);
      expect(body.map((l) => l.topic)).toEqual(
        Array.from({ length: 10 }, (_, i) => `Занятие ${i}`),
      );
    });

    it('limit=1 — одно ближайшее', async () => {
      const classId = await h.createClass();
      await h.createLessonsEveryMinute(classId, new Date(NOW.getTime() + HOUR_MS), 3);

      const body = (await h.getPublic('limit=1')).body as PublicLessonDto[];

      expect(body.map((l) => l.topic)).toEqual(['Занятие 0']);
    });

    it('limit=50 при 60 занятиях — ровно 50', async () => {
      const classId = await h.createClass();
      await h.createLessonsEveryMinute(classId, new Date(NOW.getTime() + HOUR_MS), 60);

      expect(await listIds('limit=50')).toHaveLength(50);
    });

    it('занятие ровно в now включено, на секунду раньше — нет', async () => {
      const classId = await h.createClass();
      const atNow = await h.createLesson({ classId, startsAt: NOW });
      await h.createLesson({ classId, startsAt: new Date(NOW.getTime() - 1000) });

      expect(await listIds('limit=50')).toEqual([atNow]);
    });

    it('отменённое будущее занятие остаётся в списке со статусом cancelled', async () => {
      const classId = await h.createClass();
      await h.createLesson({
        classId,
        startsAt: new Date(NOW.getTime() + HOUR_MS),
        status: 'cancelled',
      });

      const body = (await h.getPublic()).body as PublicLessonDto[];

      expect(body.map((l) => l.status)).toEqual(['cancelled']);
    });
  });

  describe('режим «окно»', () => {
    const SEEDED = [2, 3, 4, 5].map(contractLessonId);

    it('фикстура контракта 001–006 — ровно 002, 003, 004, 005; 004 отменено', async () => {
      await h.seedContractLessons();

      const res = await h.getPublic(WINDOW_QUERY);

      expect(res.status).toBe(200);
      const body = res.body as PublicLessonDto[];
      expect(body.map((l) => l.id)).toEqual(SEEDED);
      expect(body.map((l) => l.status)).toEqual([
        'scheduled',
        'scheduled',
        'cancelled',
        'scheduled',
      ]);
    });

    it('смещение в виде +0300 даёт те же границы, now окно не сужает', async () => {
      await h.seedContractLessons();

      const ids = await listIds(
        'from=2026-10-05T00:00:00%2B0300&to=2026-10-19T00:00:00%2B0300',
      );

      expect(ids).toEqual(SEEDED);
    });

    it('перенос 003 внутри окна — тот же id, теперь после 004', async () => {
      await h.seedContractLessons();
      await h.moveLesson(3, '2026-10-07T15:00:00Z');

      const body = (await h.getPublic(WINDOW_QUERY)).body as PublicLessonDto[];

      expect(body.map((l) => l.id)).toEqual([2, 4, 3, 5].map(contractLessonId));
      expect(body.find((l) => l.id === contractLessonId(3))?.startsAt).toBe(
        '2026-10-07T15:00:00.000Z',
      );
    });

    it('перенос 003 за окно — его в ответе нет', async () => {
      await h.seedContractLessons();
      await h.moveLesson(3, '2026-10-20T15:00:00Z');

      expect(await listIds(WINDOW_QUERY)).toEqual([2, 4, 5].map(contractLessonId));
    });

    it('отмена 005 — остаётся в ответе с тем же id и статусом cancelled', async () => {
      await h.seedContractLessons();
      await h
        .lessonModel()
        .updateOne({ _id: contractLessonId(5) }, { status: 'cancelled' });

      const body = (await h.getPublic(WINDOW_QUERY)).body as PublicLessonDto[];

      const moved = body.find((l) => l.id === contractLessonId(5));
      expect(moved?.status).toBe('cancelled');
      expect(body).toHaveLength(4);
    });

    it('пустое окно — 200 и []', async () => {
      expect(await listIds(WINDOW_QUERY)).toEqual([]);
    });

    it('201 занятие в окне — все 201, без limit и пагинации', async () => {
      const classId = await h.createClass();
      await h.createLessonsEveryMinute(classId, new Date('2026-10-05T00:00:00Z'), 201);

      const ids = await listIds('from=2026-10-05T00:00:00Z&to=2026-10-06T00:00:00Z');

      expect(ids).toHaveLength(201);
      expect(new Set(ids).size).toBe(201);
    });

    it('пример со сменой смещения (337 часов) принимается', async () => {
      const query = 'from=2024-10-20T00:00:00%2B03:00&to=2024-11-03T00:00:00%2B02:00';

      expect(await listIds(query)).toEqual([]);
    });
  });

  describe('прочее', () => {
    // У контроллера один маршрут. Утверждение 404 на путь под
    // /api/public/lessons — ещё и то, что check-ownership-e2e.mjs требует от
    // спека контроллера: «чужое» здесь не бывает, расписание школы общее и
    // публичное, поэтому отказ проверяем на лишнем пути, а не на владельце.
    it('GET /api/public/lessons/anything — 404', async () => {
      const res = await request(h.server()).get(`${PUBLIC_LESSONS_PATH}/anything`);
      expect(res.status).toBe(404);
    });

    // Регресс: защищённый маршрут ученика не тронут, Zoom в нём по-прежнему есть.
    it('GET /api/me/lessons с сессией по-прежнему отдаёт zoomLink', async () => {
      const classId = await h.createClass();
      await h.createLesson({ classId, startsAt: new Date(NOW.getTime() + HOUR_MS) });
      const cookie = await sessionCookieFor(testApp.app, []);

      const res = await request(h.server()).get('/api/me/lessons').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as MyLessonDto[])[0]?.zoomLink).toBe(ZOOM_LINK);
    });
  });
});
