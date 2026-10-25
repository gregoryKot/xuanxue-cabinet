// e2e доски ученика (ADR-0172): `GET /me/board` — данные школы, видны любой
// роли по сессии (e2e-support/README.md, «данные школы»), без сессии 401.
// Учитель пишет объявление через PATCH /settings, ученик, которому /settings
// закрыт, видит его на своей доске — read-after-write по двум точкам входа.
// Сроки — от настоящего «сегодня» с запасом в пару суток, чтобы граница
// полуночи не мигала; точную границу дня в поясе школы держит
// board.service.spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import { SCHOOL_TZ, type MyBoardDto, type UserRole } from '@xuanxue/shared';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const NOTICE_TEXT = 'Ретрит в ноябре — оплата до 20 октября Маше';

function dayKeyFromToday(offsetDays: number): string {
  return DateTime.now().setZone(SCHOOL_TZ).plus({ days: offsetDays }).toISODate() ?? '';
}

describe('GET /me/board (e2e)', () => {
  let testApp: TestApp;
  let settingsModel: Model<SettingsRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    settingsModel = testApp.app.get<Model<SettingsRecord>>(
      getModelToken(SettingsRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await settingsModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function publishNotice(until: string): Promise<void> {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', teacher)
      .send({ boardNotice: { text: NOTICE_TEXT, until } });
    expect(res.status).toBe(200);
  }

  async function boardFor(roles: UserRole[]): Promise<MyBoardDto> {
    const cookie = await sessionCookieFor(testApp.app, roles);
    const res = await request(server()).get('/api/me/board').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as MyBoardDto;
  }

  it('без сессии — 401', async () => {
    expect((await request(server()).get('/api/me/board')).status).toBe(401);
  });

  it('на чистой базе объявления нет', async () => {
    expect(await boardFor([])).toEqual({ notice: null });
  });

  it('ученик без ролей видит объявление, которое написал учитель', async () => {
    const until = dayKeyFromToday(3);
    await publishNotice(until);

    expect(await boardFor([])).toEqual({ notice: { text: NOTICE_TEXT, until } });
  });

  it('учитель и бухгалтер видят ту же доску', async () => {
    const until = dayKeyFromToday(3);
    await publishNotice(until);

    expect((await boardFor(['teacher'])).notice?.text).toBe(NOTICE_TEXT);
    expect((await boardFor(['accountant'])).notice?.text).toBe(NOTICE_TEXT);
  });

  it('срок прошёл — null, хотя в настройках объявление ещё лежит', async () => {
    await publishNotice(dayKeyFromToday(-2));

    expect(await boardFor([])).toEqual({ notice: null });
    const stored = await settingsModel.findById('school').lean();
    expect(stored?.boardNotice?.text).toBe(NOTICE_TEXT);
  });

  it('учитель сбросил объявление — доска пустая', async () => {
    await publishNotice(dayKeyFromToday(3));
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', teacher)
      .send({ boardNotice: null });
    expect(res.status).toBe(200);

    expect(await boardFor([])).toEqual({ notice: null });
  });
});
