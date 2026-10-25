// e2e GET /api/me/notifications/lessons/sync на настоящем AppModule (ADR-0185,
// контракт Workshop reminder-sync): один маршрут, два credential — cookie
// браузера и bearer Daychi. Владение: выбор А не виден Б ни по cookie, ни по
// bearer; id аккаунта берётся только из credential. Граница bearer (N17) —
// native-account.e2e-spec.ts; здесь — что соседние маршруты настроек bearer
// по-прежнему не открывает.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { ReminderSyncSnapshot } from '@xuanxue/shared';
import { NativeGrantsService } from '../src/native-auth/native-grants.service';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { createUserWithSession } from './e2e-support/session';
import { bearer, issueNativeGrant, useNativeApi } from './e2e-support/native-fixtures';

const SYNC = '/api/me/notifications/lessons/sync';

describe('снимок настроек напоминаний: cookie и bearer (e2e)', () => {
  const api = useNativeApi();
  const { app, server } = api;

  const prefs = (): Model<NotificationPrefsRecord> =>
    app().get<Model<NotificationPrefsRecord>>(
      getModelToken(NotificationPrefsRecord.name),
      {
        strict: false,
      },
    );

  const byCookie = (cookie: string): request.Test =>
    request(server()).get(SYNC).set('Cookie', cookie);
  const byBearer = (token: string): request.Test =>
    request(server()).get(SYNC).set('Authorization', bearer(token));

  /** Человек с cookie и с bearer одного и того же аккаунта. */
  async function account(name = 'Мария'): Promise<{
    userId: string;
    cookie: string;
    token: string;
  }> {
    const { userId, cookie } = await createUserWithSession(app(), { name, roles: [] });
    const { access_token: token } = await issueNativeGrant(app(), userId);
    return { userId, cookie, token };
  }

  function expectNoStoreEnvelope(res: request.Response, status: number, code: string) {
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ statusCode: status, code });
    expect(res.headers['cache-control']).toBe('no-store');
  }

  it('cookie: свежий аккаунт получает снимок без выбора, ответ с no-store, каталог по id', async () => {
    const { userId, cookie } = await account();

    const res = await byCookie(cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      version: 1,
      accountId: userId,
      revision: '0',
      classIds: [],
      lessonIds: [],
      leadMinutes: null,
      schoolMinutes: expect.any(Number) as number,
      classes: expect.any(Array) as unknown[],
    });
    const ids = (res.body as ReminderSyncSnapshot).classes.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual([...ids].sort());
  });

  it('bearer: тот же аккаунт — то же тело, cookie не ставится', async () => {
    const { cookie, token } = await account();

    const viaCookie = await byCookie(cookie);
    const viaBearer = await byBearer(token);

    expect(viaBearer.status).toBe(200);
    expect(viaBearer.body).toEqual(viaCookie.body);
    expect(viaBearer.headers['cache-control']).toBe('no-store');
    expect(viaBearer.headers['set-cookie']).toBeUndefined();
  });

  it('bearer не продлевает и не перевыпускает cookie, даже если рядом негодная', async () => {
    const { token } = await account();

    const res = await byBearer(token).set('Cookie', 'session=not-a-token');

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('записанный выбор читается отсортированным, ревизия — строкой, на обоих credential', async () => {
    const { userId, cookie, token } = await account();
    await prefs().create({
      userId,
      reminderClassIds: ['c2', 'c1', 'c2'],
      reminderLessonIds: ['l2', 'l10'],
      reminderRevision: 5,
      lessonReminderMinutes: 30,
    });

    const viaCookie = (await byCookie(cookie)).body as ReminderSyncSnapshot;
    const viaBearer = (await byBearer(token)).body as ReminderSyncSnapshot;

    expect(viaCookie).toMatchObject({
      accountId: userId,
      revision: '5',
      classIds: ['c1', 'c2'],
      lessonIds: ['l10', 'l2'],
      leadMinutes: 30,
    });
    expect(viaBearer).toEqual(viaCookie);
  });

  it('владение: выбор А не виден Б ни по cookie, ни по bearer', async () => {
    const a = await account('Мария');
    const b = await account('Борис');
    await prefs().create({
      userId: a.userId,
      reminderClassIds: ['секрет-а'],
      reminderRevision: 3,
      lessonReminderMinutes: 120,
    });

    const seenByB = [(await byCookie(b.cookie)).body, (await byBearer(b.token)).body];

    for (const body of seenByB) {
      expect(body).toMatchObject({
        accountId: b.userId,
        revision: '0',
        classIds: [],
        leadMinutes: null,
      });
      expect(JSON.stringify(body)).not.toContain('секрет-а');
    }
  });

  it('Authorization вместе с живой cookie — 400 ambiguous_credentials, no-store, без Set-Cookie', async () => {
    const { cookie, token } = await account();

    const res = await byCookie(cookie).set('Authorization', bearer(token));

    expectNoStoreEnvelope(res, 400, 'ambiguous_credentials');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('отозванный доступ — 401 в конверте кабинета, не в нативном формате', async () => {
    const { token } = await account();
    await app().get(NativeGrantsService).revoke(token, DateTime.utc());

    const res = await byBearer(token);

    expectNoStoreEnvelope(res, 401, 'unauthorized');
    expect(res.body).not.toEqual({ error: 'invalid_token' });
  });

  it.each([
    ['чужой формат', 'Basic abc'],
    ['незнакомый токен', `Bearer ${'q'.repeat(43)}`],
    ['токен не нашего формата', 'Bearer not-a-native-token'],
  ])('%s — 401 unauthorized', async (_name, header) => {
    const res = await request(server()).get(SYNC).set('Authorization', header);

    expectNoStoreEnvelope(res, 401, 'unauthorized');
  });

  it('заблокированный аккаунт — 403 по bearer и по cookie', async () => {
    const { userId, cookie, token } = await account();
    await api.users().updateOne({ _id: userId }, { status: 'blocked' });

    expectNoStoreEnvelope(await byBearer(token), 403, 'forbidden');
    expectNoStoreEnvelope(await byCookie(cookie), 403, 'forbidden');
  });

  it('удалённый аккаунт — 401 по bearer', async () => {
    const { userId, token } = await account();
    await api.users().deleteOne({ _id: userId });

    expectNoStoreEnvelope(await byBearer(token), 401, 'unauthorized');
  });

  it('без credential — 401 с no-store', async () => {
    expectNoStoreEnvelope(await request(server()).get(SYNC), 401, 'unauthorized');
  });

  it('bearer не открывает соседние маршруты настроек уведомлений', async () => {
    const { token } = await account();

    const lessons = await request(server())
      .get('/api/me/notifications/lessons')
      .set('Authorization', bearer(token));
    const kinds = await request(server())
      .get('/api/me/notifications')
      .set('Authorization', bearer(token));

    expect(lessons.status).toBe(401);
    expect(kinds.status).toBe(401);
  });
});
