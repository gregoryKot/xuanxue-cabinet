// e2e POST /auth/telegram через настоящий AppModule (SECURITY §2, ADR-0005).
// BOT_TOKEN и BOOTSTRAP_ADMIN_TELEGRAM_ID — тестовые константы из
// create-app.ts (setTestEnv), подписываем ими тела запросов тем же
// алгоритмом, что telegram-login.ts. Кейс «без BOT_TOKEN» невозможен на
// одном AppModule — он в telegram-auth.service.spec.ts.
//
// Троттлинг (Throttle 10/60с на этом маршруте) бакетируется по IP — без
// разных x-forwarded-for на каждый тест их POST'ы делят один бакет и
// случайно ловят 429 друг у друга. freshIp() выдаёт новый IP каждому тесту
// (trust proxy включён в app.setup.ts — x-forwarded-for учитывается).
import { createHash, createHmac } from 'crypto';
import request from 'supertest';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import {
  createTestApp,
  TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
  TEST_BOT_TOKEN,
  type TestApp,
} from './e2e-support/create-app';

interface TelegramFields {
  id: number;
  first_name: string;
  auth_date: number;
  [extra: string]: unknown;
}

function sign(fields: Record<string, unknown>): string {
  const dataCheckString = Object.entries(fields)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
  const secretKey = createHash('sha256').update(TEST_BOT_TOKEN).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

function telegramLoginBody(
  overrides: Partial<TelegramFields> = {},
): Record<string, unknown> {
  const fields: TelegramFields = {
    id: 12345,
    first_name: 'Мария',
    auth_date: Math.floor(DateTime.utc().toSeconds()),
    ...overrides,
  };
  return { ...fields, hash: sign(fields) };
}

// Приватный диапазон TEST-NET-3 (RFC 5737) — не реальный трафик, каждому
// тесту свой адрес, чтобы троттлер (лимит по IP) не смешивал их бакеты.
let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /auth/telegram (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function post(body: Record<string, unknown>, ip: string): request.Test {
    return request(server())
      .post('/api/auth/telegram')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(body);
  }

  it('успешный вход бутстрап-админа — cookie, MeDto, роли admin+teacher', async () => {
    const res = await post(
      telegramLoginBody({ id: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID, first_name: 'Дима' }),
      freshIp(),
    );

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body).toMatchObject({ name: 'Дима', roles: ['admin', 'teacher'] });
    expect(String(res.headers['set-cookie'])).toContain('session=');
  });

  it('обычный id без bootstrap — роли []', async () => {
    const res = await post(
      telegramLoginBody({ id: 111, first_name: 'Ученик' }),
      freshIp(),
    );

    expect(res.status).toBe(200);
    expect((res.body as MeDto).roles).toEqual([]);
  });

  it('повторный вход тем же id — тот же userId', async () => {
    const ip = freshIp();
    const first = await post(telegramLoginBody({ id: 555 }), ip);
    const second = await post(telegramLoginBody({ id: 555 }), ip);

    expect((first.body as MeDto).id).toBe((second.body as MeDto).id);
  });

  it('два параллельных первых входа одним id — оба 200, в базе один пользователь', async () => {
    const ip = freshIp();
    const id = 424_242;

    const [first, second] = await Promise.all([
      post(telegramLoginBody({ id }), ip),
      post(telegramLoginBody({ id }), ip),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = first.body as MeDto;
    const secondBody = second.body as MeDto;
    expect(firstBody.id).toBe(secondBody.id);
  });

  it('все 7 полей виджета с верной подписью — 200', async () => {
    const res = await post(
      telegramLoginBody({
        id: 654_321,
        first_name: 'Пётр',
        last_name: 'Иванов',
        username: 'petr_ivanov',
        photo_url: 'https://t.me/i/userpic/320/petr.jpg',
      }),
      freshIp(),
    );

    expect(res.status).toBe(200);
    expect((res.body as MeDto).name).toBe('Пётр Иванов');
  });

  it('дополнительное неизвестное поле, подписанное вместе с остальными, — 200', async () => {
    const res = await post(
      telegramLoginBody({ id: 777_001, chat_instance: 'что-то от Telegram' }),
      freshIp(),
    );

    expect(res.status).toBe(200);
  });

  it('битый hash — 401', async () => {
    const body = { ...telegramLoginBody({ id: 777 }), hash: 'a'.repeat(64) };

    const res = await post(body, freshIp());

    expect(res.status).toBe(401);
  });

  it('протухший auth_date — 401', async () => {
    const staleAuthDate = Math.floor(DateTime.utc().minus({ days: 2 }).toSeconds());

    const res = await post(
      telegramLoginBody({ id: 888, auth_date: staleAuthDate }),
      freshIp(),
    );

    expect(res.status).toBe(401);
  });

  it('без x-requested-with — 403 (CSRF действует и для @Public())', async () => {
    const res = await request(server())
      .post('/api/auth/telegram')
      .set('x-forwarded-for', freshIp())
      .send(telegramLoginBody({ id: 999 }));

    expect(res.status).toBe(403);
  });

  it('11-й запрос с одного IP за минуту — 429 в конверте', async () => {
    const ip = freshIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await post(telegramLoginBody({ id: 1_000_000 + attempt }), ip);
      expect(res.status).toBe(200);
    }

    const res = await post(telegramLoginBody({ id: 1_000_010 }), ip);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      code: 'rate_limited',
      message: 'Слишком много запросов. Подождите минуту и попробуйте ещё раз.',
    });
  }, 30_000);
});
