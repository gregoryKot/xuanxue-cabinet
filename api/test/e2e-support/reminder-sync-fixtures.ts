// Общее для e2e записи настроек напоминаний (reminder-sync-write*.e2e-spec.ts,
// ADR-0185): аккаунт с cookie и bearer, занятия в базе, запросы `PATCH`/`GET` и
// два ожидания — отказ в конверте кабинета и «ничего не записано». Вынесено,
// чтобы оба спека уместились в лимит файл-храповика без дублей.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { ReminderChange, ReminderSyncSnapshot } from '@xuanxue/shared';
import { ClassRecord } from '../../src/classes/class.schema';
import { LessonRecord } from '../../src/lessons/lesson.schema';
import { NotificationPrefsRecord } from '../../src/notifications/notification-prefs.schema';
import { bearer, issueNativeGrant, useNativeApi } from './native-fixtures';
import { createUserWithSession } from './session';

export const SYNC = '/api/me/notifications/lessons/sync';
export const JSON_TYPE = 'application/json';

export interface SyncAccount {
  userId: string;
  cookie: string;
  token: string;
}

export const select = (
  kind: 'class' | 'lesson',
  id: string,
  selected = true,
): ReminderChange => ({ kind, id, selected });

export const body = (...changes: ReminderChange[]) => ({ version: 1, changes });

/** Поднимает `AppModule` на файл и отдаёт запросы к маршруту записи. */
export function useReminderSyncApi() {
  const api = useNativeApi();
  const { app, server } = api;
  const model = <T>(name: string): Model<T> =>
    app().get<Model<T>>(getModelToken(name), { strict: false });
  const prefs = () => model<NotificationPrefsRecord>(NotificationPrefsRecord.name);

  async function account(name = 'Мария'): Promise<SyncAccount> {
    const { userId, cookie } = await createUserWithSession(app(), { name, roles: [] });
    const { access_token: token } = await issueNativeGrant(app(), userId);
    return { userId, cookie, token };
  }

  async function seedClass(active = true): Promise<string> {
    const doc = await model<ClassRecord>(ClassRecord.name).create({
      title: 'Занятие',
      format: 'online',
      rules: [{ weekday: 2 as const, time: '19:00', durationMin: 60 }],
      active,
    });
    return doc.id;
  }

  async function seedLesson(status: 'scheduled' | 'cancelled' = 'scheduled') {
    const doc = await model<LessonRecord>(LessonRecord.name).create({
      classId: new Types.ObjectId(await seedClass()),
      startsAt: DateTime.utc().toJSDate(),
      durationMin: 60,
      status,
    });
    return doc.id;
  }

  /** Сырой текст тела: так виден повтор ключа, которого нет в объекте. */
  const rawPatch = (who: Pick<SyncAccount, 'cookie'>, text: string | Buffer) =>
    request(server())
      .patch(SYNC)
      .set('Cookie', who.cookie)
      .set('x-requested-with', 'fetch')
      .set('Content-Type', JSON_TYPE)
      .send(text);
  const patchBy = (who: Pick<SyncAccount, 'cookie'>, ...changes: ReminderChange[]) =>
    rawPatch(who, JSON.stringify(body(...changes)));
  const patchByBearer = (token: string, ...changes: ReminderChange[]) =>
    request(server())
      .patch(SYNC)
      .set('Authorization', bearer(token))
      .set('Content-Type', JSON_TYPE)
      .send(JSON.stringify(body(...changes)));
  const read = async (who: Pick<SyncAccount, 'cookie'>) =>
    (await request(server()).get(SYNC).set('Cookie', who.cookie))
      .body as ReminderSyncSnapshot;

  /** Отказ в конверте кабинета, с `no-store`. */
  function expectRefusal(res: request.Response, status: number, code: string): void {
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ statusCode: status, code });
    expect(res.headers['cache-control']).toBe('no-store');
  }

  async function expectNothingWritten(who: SyncAccount): Promise<void> {
    expect(await prefs().countDocuments({ userId: who.userId })).toBe(0);
    expect((await read(who)).revision).toBe('0');
  }

  return {
    api,
    app,
    server,
    prefs,
    account,
    seedClass,
    seedLesson,
    rawPatch,
    patchBy,
    patchByBearer,
    read,
    expectRefusal,
    expectNothingWritten,
  };
}
