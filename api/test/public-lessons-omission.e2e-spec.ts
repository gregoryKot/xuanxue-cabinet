// e2e на битые занятия GET /public/lessons (ADR-0170, контракт Workshop
// public-lessons.md, случай 6): битое занятие или класс выпадает из ответа
// 200 с error-логом на каждое пропущенное занятие, остальные отдаются; сбой
// чтения — 500 `internal_error`, не 200. Битое значение кладём updateOne мимо
// схемы: create() с required/enum его не пустил бы, а уже лежащий документ
// lean() отдаёт как есть. Часы заморожены через Settings.now Luxon.
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { Settings } from 'luxon';
import type { ApiErrorBody, PublicLessonDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  contractLessonId,
  createPublicLessonHelpers,
  ZOOM_LINK,
  ZOOM_PASSWORD,
} from './e2e-support/public-lessons-fixtures';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const HOUR_MS = 3_600_000;
const REQUEST_ID = 'e2e-omission-1';
const OMISSION_MARK = 'Публичное занятие пропущено';
const WINDOW_QUERY = 'from=2026-10-05T00:00:00%2B03:00&to=2026-10-19T00:00:00%2B03:00';

describe('GET /public/lessons — битые занятия (e2e)', () => {
  let testApp: TestApp;
  const h = createPublicLessonHelpers(() => testApp);
  const realNow = Settings.now;
  let errorLog: jest.SpyInstance;

  beforeAll(async () => {
    Settings.now = () => NOW.getTime();
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    Settings.now = realNow;
    await testApp.close();
  });

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    errorLog.mockRestore();
    await h.clearAll();
  });

  function omissionLogs(): string[] {
    return errorLog.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes(OMISSION_MARK));
  }

  function at(hours: number): Date {
    return new Date(NOW.getTime() + hours * HOUR_MS);
  }

  async function getIds(query = ''): Promise<string[]> {
    const res = await h.getPublic(query).set('x-request-id', REQUEST_ID);
    expect(res.status).toBe(200);
    return (res.body as PublicLessonDto[]).map((l) => l.id);
  }

  it('смесь: без durationMin, класс с чужим format, без класса — 200 только с целыми', async () => {
    const goodClass = await h.createClass();
    const badClass = await h.createClass();
    await h.classModel().updateOne({ _id: badClass }, { $set: { format: 'hybrid' } });
    const valid = await h.createLesson({ classId: goodClass, startsAt: at(1) });
    const noDuration = await h.createLesson({ classId: goodClass, startsAt: at(2) });
    await h.lessonModel().updateOne({ _id: noDuration }, { $unset: { durationMin: 1 } });
    const badFormat = await h.createLesson({ classId: badClass, startsAt: at(3) });
    const missingClassId = new Types.ObjectId();
    const orphan = await h.createLesson({ classId: missingClassId, startsAt: at(4) });

    expect(await getIds()).toEqual([valid]);

    const logs = omissionLogs();
    expect(logs).toHaveLength(3);
    const expected: [string, string, string][] = [
      [noDuration, goodClass.toString(), 'durationMin'],
      [badFormat, badClass.toString(), 'format'],
      [orphan, missingClassId.toString(), 'класс не найден'],
    ];
    for (const [lessonId, classId, cause] of expected) {
      const line = logs.find((log) => log.includes(`lessonId=${lessonId}`));
      expect(line).toContain(`classId=${classId}`);
      expect(line).toContain(`requestId=${REQUEST_ID}`);
      expect(line).toContain(cause);
    }
    const all = logs.join('\n');
    expect(all).not.toMatch(/zoom/i);
    expect(all).not.toContain(ZOOM_LINK);
    expect(all).not.toContain(ZOOM_PASSWORD);
  });

  it('битый общий класс — выпадают все его занятия, чужие остаются', async () => {
    const goodClass = await h.createClass();
    const badClass = await h.createClass();
    await h.classModel().updateOne({ _id: badClass }, { $set: { format: 'hybrid' } });
    await h.createLesson({ classId: badClass, startsAt: at(1) });
    const valid = await h.createLesson({ classId: goodClass, startsAt: at(2) });
    await h.createLesson({ classId: badClass, startsAt: at(3) });

    expect(await getIds()).toEqual([valid]);
    expect(omissionLogs()).toHaveLength(2);
  });

  it('фикстура контракта: у 003 нет durationMin — 002, 004, 005; починили — снова все четыре', async () => {
    await h.seedContractLessons();
    await h
      .lessonModel()
      .updateOne({ _id: contractLessonId(3) }, { $unset: { durationMin: 1 } });

    expect(await getIds(WINDOW_QUERY)).toEqual([2, 4, 5].map(contractLessonId));
    expect(omissionLogs()).toHaveLength(1);

    await h.lessonModel().updateOne({ _id: contractLessonId(3) }, { durationMin: 60 });

    expect(await getIds(WINDOW_QUERY)).toEqual([2, 3, 4, 5].map(contractLessonId));
  });

  it('все кандидаты битые — 200 и [] с логами', async () => {
    const classId = await h.createClass();
    await h.classModel().updateOne({ _id: classId }, { $set: { format: 'hybrid' } });
    await h.createLesson({ classId, startsAt: at(1) });
    await h.createLesson({ classId, startsAt: at(2) });

    expect(await getIds()).toEqual([]);
    expect(omissionLogs()).toHaveLength(2);
  });

  it('кандидатов нет — 200 и [] без логов пропуска', async () => {
    expect(await getIds()).toEqual([]);
    expect(omissionLogs()).toHaveLength(0);
  });

  it('limit=2, первый кандидат битый — только второй, без добора третьим', async () => {
    const classId = await h.createClass();
    const broken = await h.createLesson({ classId, startsAt: at(1) });
    await h.lessonModel().updateOne({ _id: broken }, { $unset: { durationMin: 1 } });
    const second = await h.createLesson({ classId, startsAt: at(2) });
    await h.createLesson({ classId, startsAt: at(3) });

    expect(await getIds('limit=2')).toEqual([second]);
    expect(omissionLogs()).toHaveLength(1);
  });

  it('пустые строки, нет адреса и тегов — занятие целое, не выпадает', async () => {
    const classId = await h.createClass();
    await h.classModel().updateOne({ _id: classId }, { $set: { title: '' } });
    const id = await h.createLesson({ classId, startsAt: at(1), topic: '' });

    expect(await getIds()).toEqual([id]);
    expect(omissionLogs()).toHaveLength(0);
  });

  it('сбой чтения классов — 500 internal_error, а не 200', async () => {
    const classId = await h.createClass();
    await h.createLesson({ classId, startsAt: at(1) });
    const find = jest.spyOn(h.classModel(), 'find').mockImplementation(() => {
      throw new Error('Mongo недоступна');
    });

    const res = await h.getPublic();
    find.mockRestore();

    expect(res.status).toBe(500);
    expect(Array.isArray(res.body)).toBe(false);
    expect((res.body as ApiErrorBody).code).toBe('internal_error');
    expect(res.text).not.toContain('Mongo недоступна');
    expect(omissionLogs()).toHaveLength(0);
  });
});
