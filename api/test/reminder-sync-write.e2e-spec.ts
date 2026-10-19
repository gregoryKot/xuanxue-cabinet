// e2e PATCH /api/me/notifications/lessons/sync на настоящем AppModule (ADR-0185,
// контракт Workshop reminder-sync): запись выбора напоминаний по cookie и по
// bearer. Что держит тест: «записал → прочитал» через GET, отказ без записи на
// ветках доступа и состояния, настоящая конкурентность (compare-and-set по
// ревизии), владение — выбор А недоступен и не меняется запросом Б. Разбор тела —
// reminder-sync-write-input.e2e-spec.ts; чтение и граница bearer —
// reminder-sync-read.e2e-spec.ts и native-account.e2e-spec.ts.
import { DateTime } from 'luxon';
import request from 'supertest';
import { LESSON_SCOPE_CLASS_IDS_MAX } from '@xuanxue/shared';
import { NativeGrantsService } from '../src/native-auth/native-grants.service';
import {
  JSON_TYPE,
  SYNC,
  body,
  select,
  useReminderSyncApi,
} from './e2e-support/reminder-sync-fixtures';

describe('запись настроек напоминаний: cookie и bearer (e2e)', () => {
  const t = useReminderSyncApi();
  const { patchBy, patchByBearer, read, expectRefusal, expectNothingWritten } = t;
  const nothing = { kind: 'lead', minutes: 15 } as const;

  it('cookie с x-requested-with: 200, полный снимок, ревизия "1", no-store; GET видит то же', async () => {
    const me = await t.account();
    const [classId, lessonId] = [await t.seedClass(), await t.seedLesson()];

    const res = await patchBy(me, select('class', classId), select('lesson', lessonId), {
      kind: 'lead',
      minutes: 60,
    });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      version: 1,
      accountId: me.userId,
      revision: '1',
      classIds: [classId],
      lessonIds: [lessonId],
      leadMinutes: 60,
    });
    expect(await read(me)).toEqual(res.body);
  });

  it('cookie без x-requested-with: 403, ничего не записано', async () => {
    const me = await t.account();

    const res = await request(t.server())
      .patch(SYNC)
      .set('Cookie', me.cookie)
      .set('Content-Type', JSON_TYPE)
      .send(JSON.stringify(body(nothing)));

    expectRefusal(res, 403, 'forbidden');
    await expectNothingWritten(me);
  });

  it('bearer без x-requested-with: 200, cookie не ставится, no-store', async () => {
    const me = await t.account();

    const res = await patchByBearer(me.token, { kind: 'lead', minutes: 30 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accountId: me.userId,
      revision: '1',
      leadMinutes: 30,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((await read(me)).leadMinutes).toBe(30);
  });

  it('bearer и cookie вместе: 400 ambiguous_credentials, ничего не записано', async () => {
    const me = await t.account();

    const res = await patchByBearer(me.token, nothing).set('Cookie', me.cookie);

    expectRefusal(res, 400, 'ambiguous_credentials');
    await expectNothingWritten(me);
  });

  it('отозванный доступ — 401, заблокированный — 403, без credential — 401; записи нет', async () => {
    const revoked = await t.account();
    await t.app().get(NativeGrantsService).revoke(revoked.token, DateTime.utc());
    const blocked = await t.account('Борис');
    await t.api.users().updateOne({ _id: blocked.userId }, { status: 'blocked' });

    expectRefusal(await patchByBearer(revoked.token, nothing), 401, 'unauthorized');
    expectRefusal(await patchByBearer(blocked.token, nothing), 403, 'forbidden');
    expectRefusal(await patchBy(blocked, nothing), 403, 'forbidden');
    const anonymous = await request(t.server())
      .patch(SYNC)
      .set('x-requested-with', 'fetch')
      .set('Content-Type', JSON_TYPE)
      .send('{}');
    expectRefusal(anonymous, 401, 'unauthorized');
    expect(await t.prefs().countDocuments({ userId: blocked.userId })).toBe(0);
  });

  it('добавить несуществующее занятие расписания или занятие: 400; в пакете с верным — ничего', async () => {
    const me = await t.account();
    const classId = await t.seedClass();
    const missing = 'f'.repeat(24);

    expectRefusal(await patchBy(me, select('class', missing)), 400, 'invalid_input');
    expectRefusal(
      await patchBy(me, select('class', classId), select('lesson', missing)),
      400,
      'invalid_input',
    );
    await expectNothingWritten(me);
  });

  it('выключенное занятие расписания и отменённое занятие добавить можно', async () => {
    const me = await t.account();
    const [off, cancelled] = [await t.seedClass(false), await t.seedLesson('cancelled')];

    const res = await patchBy(me, select('class', off), select('lesson', cancelled));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ classIds: [off], lessonIds: [cancelled] });
  });

  it('снять отсутствующее и повторить сохранённое: 200, ревизия не растёт', async () => {
    const me = await t.account();
    const classId = await t.seedClass();
    await patchBy(me, select('class', classId), { kind: 'lead', minutes: 0 });

    const noop = await patchBy(
      me,
      select('class', 'a'.repeat(24), false),
      select('class', classId),
      { kind: 'lead', minutes: 0 },
    );

    expect(noop.status).toBe(200);
    expect(noop.body).toMatchObject({
      revision: '1',
      classIds: [classId],
      leadMinutes: 0,
    });
    expect((await read(me)).revision).toBe('1');
  });

  it('51-й выбор занятия расписания: 409 selection_limit, ничего не записано', async () => {
    const me = await t.account();
    const full = Array.from({ length: LESSON_SCOPE_CLASS_IDS_MAX }, (_, i) =>
      i.toString(16).padStart(24, '0'),
    );
    await t
      .prefs()
      .create({ userId: me.userId, reminderClassIds: full, reminderRevision: 2 });

    const res = await patchBy(me, select('class', await t.seedClass()), nothing);

    expectRefusal(res, 409, 'selection_limit');
    const after = await read(me);
    expect(after).toMatchObject({ revision: '2', leadMinutes: null });
    expect(after.classIds).toHaveLength(LESSON_SCOPE_CLASS_IDS_MAX);
  });

  it.each([0, 120, null] as const)(
    'минуты %p: записались и читаются через GET',
    async (m) => {
      const me = await t.account();
      await patchBy(me, { kind: 'lead', minutes: 60 });

      const res = await patchBy(me, { kind: 'lead', minutes: m });

      expect(res.body).toMatchObject({ revision: '2', leadMinutes: m });
      expect((await read(me)).leadMinutes).toBe(m);
    },
  );

  it('параллельно: добавление А и снятие Б (Б уже выбран) — оба результата на месте, ревизия "2"', async () => {
    const me = await t.account();
    const [a, b] = [await t.seedClass(), await t.seedClass()];
    await t.prefs().create({ userId: me.userId, reminderClassIds: [b] });

    const results = await Promise.all([
      patchBy(me, select('class', a)),
      patchBy(me, select('class', b, false)),
    ]);

    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });
    expect(await read(me)).toMatchObject({ revision: '2', classIds: [a] });
  });

  it('параллельно: запись разных значений одного ключа — одно из них, ревизия по числу изменений', async () => {
    const me = await t.account();
    const values = [15, 30, 60, 120] as const;

    const results = await Promise.all(
      values.map((minutes) => patchBy(me, { kind: 'lead', minutes })),
    );

    results.forEach((res) => expect(res.status).toBe(200));
    const final = await read(me);
    expect(values).toContain(final.leadMinutes);
    expect(final.revision).toBe('4');
  });

  it('параллельно: одинаковые записи одного значения — одно изменение, ревизия "1"', async () => {
    const me = await t.account();

    const results = await Promise.all(
      [0, 1, 2].map(() => patchBy(me, { kind: 'lead', minutes: 30 })),
    );

    results.forEach((res) => expect(res.status).toBe(200));
    expect(await read(me)).toMatchObject({ revision: '1', leadMinutes: 30 });
  });

  it('параллельно с нуля: добавления разных занятий и минуты — всё сохранилось, ревизия "5"', async () => {
    const me = await t.account();
    const ids = [
      await t.seedClass(),
      await t.seedClass(),
      await t.seedClass(),
      await t.seedClass(),
    ];

    const results = await Promise.all([
      ...ids.map((id) => patchBy(me, select('class', id))),
      patchBy(me, { kind: 'lead', minutes: 15 }),
    ]);

    results.forEach((res) => expect(res.status).toBe(200));
    const final = await read(me);
    expect(final.classIds).toEqual([...ids].sort());
    expect(final).toMatchObject({ revision: '5', leadMinutes: 15 });
  });

  it('владение: запись Б не трогает документ А, чужой accountId в теле не принимается', async () => {
    const a = await t.account('Мария');
    const b = await t.account('Борис');
    const classId = await t.seedClass();
    await patchBy(a, select('class', classId), { kind: 'lead', minutes: 120 });

    const mine = await patchBy(b, select('lesson', await t.seedLesson()));
    const spoofed = await t.rawPatch(
      b,
      JSON.stringify({ ...body(nothing), accountId: a.userId }),
    );

    expect(mine.body).toMatchObject({ accountId: b.userId, classIds: [], revision: '1' });
    expect(spoofed.status).toBe(400);
    expect(await read(a)).toMatchObject({
      accountId: a.userId,
      revision: '1',
      classIds: [classId],
      leadMinutes: 120,
    });
  });
});
