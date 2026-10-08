// e2e на отказы запроса GET /public/lessons (ADR-0170, контракт Workshop): все
// ошибки запроса — 400 `invalid_input`. Успешные ответы —
// public-lessons.e2e-spec.ts, битые занятия и сбой чтения —
// public-lessons-omission.e2e-spec.ts. Часы заморожены через Settings.now
// Luxon (CLAUDE.md «Детерминизм»).
import { Settings } from 'luxon';
import type { ApiErrorBody } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createPublicLessonHelpers } from './e2e-support/public-lessons-fixtures';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const FROM = 'from=2026-10-05T00:00:00Z';

const BAD_QUERIES: [string, string][] = [
  ['только from', FROM],
  ['только to', 'to=2026-10-06T00:00:00Z'],
  ['from без смещения', 'from=2026-10-05T00:00:00&to=2026-10-06T00:00:00Z'],
  ['дата-мусор', 'from=вчера&to=завтра'],
  ['to равен from', `${FROM}&to=2026-10-05T00:00:00Z`],
  ['to раньше from', `${FROM}&to=2026-10-04T00:00:00Z`],
  ['окно 28 суток и секунда', `${FROM}&to=2026-11-02T00:00:01Z`],
  ['limit вместе с окном', `${FROM}&to=2026-10-06T00:00:00Z&limit=5`],
  ['limit=0', 'limit=0'],
  ['limit=51', 'limit=51'],
  ['limit=abc', 'limit=abc'],
  ['limit=1.5', 'limit=1.5'],
  ['пустой limit', 'limit='],
  ['повтор limit', 'limit=1&limit=2'],
  ['повтор from', `${FROM}&from=2026-10-05T01:00:00Z&to=2026-10-06T00:00:00Z`],
  ['неизвестный параметр classId', 'classId=000000000000000000000001'],
];

describe('GET /public/lessons — отказы (e2e)', () => {
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

  it.each(BAD_QUERIES)('%s — 400 invalid_input', async (_name, query) => {
    const res = await h.getPublic(query);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('ровно 28 суток — 200', async () => {
    const res = await h.getPublic(`${FROM}&to=2026-11-02T00:00:00Z`);

    expect(res.status).toBe(200);
  });
});
