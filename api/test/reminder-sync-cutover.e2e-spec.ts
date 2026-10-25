// e2e перехода на общий выбор напоминаний (ADR-0185, контракт Workshop reminder-sync,
// «Initial write rollout») на настоящем AppModule: старый PUT reminder-minutes — обычный
// 404 `not_found`, а PUT scope остаётся для отмен, записей и материалов и к выбору
// напоминаний не прикасается; старый GET не отдаёт минуты напоминаний.
import request from 'supertest';
import type { MyLessonNotificationsDto } from '@xuanxue/shared';
import { withCsrf } from './e2e-support/http';
import { select, useReminderSyncApi } from './e2e-support/reminder-sync-fixtures';

const LESSONS = '/api/me/notifications/lessons';

describe('переход на выбор напоминаний (e2e)', () => {
  const t = useReminderSyncApi();

  const putScope = (cookie: string, body: object) =>
    withCsrf(request(t.server()).put(`${LESSONS}/scope`))
      .set('Cookie', cookie)
      .send(body);

  it.each([{ minutes: 30 }, { minutes: null }, {}])(
    'PUT reminder-minutes (%j) — 404 not_found, свои минуты не тронуты',
    async (payload) => {
      const me = await t.account();
      await t.patchBy(me, { kind: 'lead', minutes: 60 }).expect(200);

      const res = await withCsrf(request(t.server()).put(`${LESSONS}/reminder-minutes`))
        .set('Cookie', me.cookie)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ statusCode: 404, code: 'not_found' });
      expect(await t.read(me)).toMatchObject({ leadMinutes: 60, revision: '1' });
    },
  );

  it('PUT scope не меняет выбор напоминаний, «за сколько» и ревизию снимка', async () => {
    const me = await t.account();
    const [picked, other] = [await t.seedClass(), await t.seedClass()];
    await t
      .patchBy(me, select('class', picked), { kind: 'lead', minutes: 30 })
      .expect(200);
    const before = await t.read(me);

    for (const scope of [
      { mode: 'selected', classIds: [other] },
      { mode: 'all', classIds: [other] },
      { mode: 'selected', classIds: [] },
    ]) {
      await putScope(me.cookie, scope).expect(200);
    }

    expect(await t.read(me)).toEqual(before);
    expect(before).toMatchObject({ classIds: [picked], leadMinutes: 30, revision: '1' });
  });

  it('PUT scope человеку без выбора напоминаний его не создаёт: снимок пуст', async () => {
    const me = await t.account();
    const classId = await t.seedClass();

    await putScope(me.cookie, { mode: 'selected', classIds: [classId] }).expect(200);

    expect(await t.read(me)).toMatchObject({
      classIds: [],
      lessonIds: [],
      leadMinutes: null,
      revision: '0',
    });
  });

  it('старый GET отдаёт выбор «о каких занятиях» без минут напоминаний', async () => {
    const me = await t.account();
    await t.patchBy(me, { kind: 'lead', minutes: 15 }).expect(200);

    const res = await request(t.server()).get(LESSONS).set('Cookie', me.cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as MyLessonNotificationsDto).sort()).toEqual([
      'classes',
      'scope',
      'scopeChosen',
    ]);
  });
});
