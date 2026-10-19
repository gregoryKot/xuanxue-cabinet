// e2e PATCH /api/me/notifications/lessons/sync: тело запроса (ADR-0185). Тип,
// размер, повтор ключа JSON, форма — каждый отказ приходит в конверте кабинета
// с `no-store`, и в базу ничего не попадает. Доступ, состояние и конкурентность —
// reminder-sync-write.e2e-spec.ts.
import request from 'supertest';
import { REMINDER_SYNC_MAX_BODY_BYTES } from '@xuanxue/shared';
import {
  JSON_TYPE,
  SYNC,
  body,
  select,
  useReminderSyncApi,
} from './e2e-support/reminder-sync-fixtures';

describe('запись настроек напоминаний: тело запроса (e2e)', () => {
  const t = useReminderSyncApi();
  const { rawPatch, patchBy, expectRefusal, expectNothingWritten } = t;
  const lead15 = { kind: 'lead', minutes: 15 } as const;

  it.each([
    ['text/plain', 'text/plain'],
    ['форма', 'application/x-www-form-urlencoded'],
    ['не UTF-8', 'application/json; charset=latin1'],
    ['чужой параметр', 'application/json; boundary=x'],
  ])(
    'тело с типом «%s»: 415 unsupported_media_type, ничего не записано',
    async (_n, type) => {
      const me = await t.account();

      const res = await request(t.server())
        .patch(SYNC)
        .set('Cookie', me.cookie)
        .set('x-requested-with', 'fetch')
        .set('Content-Type', type)
        .send(JSON.stringify(body(lead15)));

      expectRefusal(res, 415, 'unsupported_media_type');
      await expectNothingWritten(me);
    },
  );

  it('тело без Content-Type: 415, ничего не записано', async () => {
    const me = await t.account();

    const res = await request(t.server())
      .patch(SYNC)
      .set('Cookie', me.cookie)
      .set('x-requested-with', 'fetch')
      .set('Content-Type', '')
      .send(Buffer.from(JSON.stringify(body(lead15))));

    expectRefusal(res, 415, 'unsupported_media_type');
    await expectNothingWritten(me);
  });

  it('тело больше 128 КиБ: 413 payload_too_large в конверте кабинета, ровно 128 КиБ проходит', async () => {
    const me = await t.account();
    const text = JSON.stringify(body(lead15));
    const padded = (size: number) => text + ' '.repeat(size - Buffer.byteLength(text));

    expectRefusal(
      await rawPatch(me, padded(REMINDER_SYNC_MAX_BODY_BYTES + 1)),
      413,
      'payload_too_large',
    );
    await expectNothingWritten(me);

    const exact = await rawPatch(me, padded(REMINDER_SYNC_MAX_BODY_BYTES));
    expect(exact.status).toBe(200);
    expect(exact.body).toMatchObject({ revision: '1', leadMinutes: 15 });
  });

  it.each([
    ['повтор в теле', '{"version":1,"version":1,"changes":[]}'],
    [
      'повтор в изменении',
      '{"version":1,"changes":[{"kind":"lead","minutes":15,"minutes":30}]}',
    ],
    [
      'повтор через escape',
      '{"version":1,"changes":[{"kind":"lead","minutes":15,"\\u006dinutes":30}]}',
    ],
    ['битый JSON', '{"version":1,"changes":['],
    ['пустое тело', ''],
  ])('%s: 400 invalid_input, ничего не записано', async (_n, text) => {
    const me = await t.account();

    expectRefusal(await rawPatch(me, text), 400, 'invalid_input');
    await expectNothingWritten(me);
  });

  it('повтор ключа не проходит и по адресу в другом регистре', async () => {
    const me = await t.account();

    const res = await request(t.server())
      .patch(SYNC.toUpperCase())
      .set('Cookie', me.cookie)
      .set('x-requested-with', 'fetch')
      .set('Content-Type', JSON_TYPE)
      .send('{"version":1,"version":1,"changes":[]}');

    expect(res.status).toBe(400);
    await expectNothingWritten(me);
  });

  it('0 и 65 изменений, лишнее поле, версия 2: 400, ничего не записано', async () => {
    const me = await t.account();
    const many = Array.from({ length: 65 }, (_, i) =>
      select('lesson', i.toString(16).padStart(24, '0')),
    );
    const invalid = [
      body(),
      body(...many),
      { ...body(lead15), accountId: 'чужой' },
      { version: 2, changes: [lead15] },
    ];

    for (const candidate of invalid) {
      expectRefusal(await rawPatch(me, JSON.stringify(candidate)), 400, 'invalid_input');
    }
    await expectNothingWritten(me);
  });

  it('одно неверное изменение в верном пакете: 400, ничего из пакета не записано', async () => {
    const me = await t.account();
    const classId = await t.seedClass();

    const res = await patchBy(me, select('class', classId), {
      kind: 'lead',
      minutes: 45,
    } as never);

    expectRefusal(res, 400, 'invalid_input');
    await expectNothingWritten(me);
  });
});
