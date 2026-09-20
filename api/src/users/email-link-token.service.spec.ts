// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): уникальный индекс tokenHash и TTL-индекс expiresAt должны
// действительно существовать и работать. Время — фиксированные DateTime, не
// DateTime.utc() (CLAUDE.md «Детерминизм»).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { EmailLinkTokenRecord, EmailLinkTokenSchema } from './email-link-token.schema';
import {
  EMAIL_CONFIRM_RESEND_COOLDOWN_MIN,
  EMAIL_CONFIRM_TOKEN_TTL_MIN,
  EmailLinkTokenService,
} from './email-link-token.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-18T10:00:00.000Z', { zone: 'utc' });
// Моменты считаем от самой константы, а не магическими числами (CLAUDE.md
// «Без магических чисел»): сменят кулдаун — тесты останутся верными.
const WITHIN_COOLDOWN = NOW.plus({ minutes: EMAIL_CONFIRM_RESEND_COOLDOWN_MIN - 1 });
const AFTER_COOLDOWN = NOW.plus({ minutes: EMAIL_CONFIRM_RESEND_COOLDOWN_MIN + 1 });
const USER_ID = '68c9a000a000a000a000a001';
const OTHER_USER_ID = '68c9a000a000a000a000a002';
const EMAIL = 'ученик@example.com';

describe('EmailLinkTokenService', () => {
  let memory: MemoryMongo;
  let model: Model<EmailLinkTokenRecord>;
  let service: EmailLinkTokenService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<EmailLinkTokenRecord>(
      EmailLinkTokenRecord.name,
      EmailLinkTokenSchema,
    );
    service = new EmailLinkTokenService(model);
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  /** issue() отдаёт `null` только внутри кулдауна повторной отправки
   * (EMAIL_CONFIRM_RESEND_COOLDOWN_MIN). Тесты ниже кулдаун не задевают, и
   * токен там обязан быть — проверяем это одним местом, а не `!` в каждой
   * строке (CLAUDE.md «Код»: non-null assertion — с объяснением или никак). */
  async function issued(userId: string, email: string, now: DateTime): Promise<string> {
    const token = await service.issue(userId, email, now);
    if (token === null) throw new Error('issue вернул null вне кулдауна');
    return token;
  }

  it('issue → consume: read-after-write, возвращает userId и email владельца', async () => {
    const token = await issued(USER_ID, EMAIL, NOW);

    const owner = await service.consume(token, NOW.plus({ minutes: 1 }));

    expect(owner).toEqual({ userId: USER_ID, email: EMAIL });
  });

  it('consume: тот же токен второй раз — null, одноразовость', async () => {
    const token = await issued(USER_ID, EMAIL, NOW);

    const first = await service.consume(token, NOW);
    const second = await service.consume(token, NOW);

    expect(first).toEqual({ userId: USER_ID, email: EMAIL });
    expect(second).toBeNull();
  });

  it('consume: неизвестный токен — null', async () => {
    await expect(service.consume('a'.repeat(64), NOW)).resolves.toBeNull();
  });

  it('consume: протухший (старше TTL) — null', async () => {
    const token = await issued(USER_ID, EMAIL, NOW);

    const owner = await service.consume(
      token,
      NOW.plus({ minutes: EMAIL_CONFIRM_TOKEN_TTL_MIN, seconds: 1 }),
    );

    expect(owner).toBeNull();
  });

  it('consume: ровно на границе TTL — ещё действует ($gt строгий, но граница не задета)', async () => {
    const token = await issued(USER_ID, EMAIL, NOW);

    const owner = await service.consume(
      token,
      NOW.plus({ minutes: EMAIL_CONFIRM_TOKEN_TTL_MIN }).minus({ seconds: 1 }),
    );

    expect(owner).toEqual({ userId: USER_ID, email: EMAIL });
  });

  it('issue: повторный вызов удаляет прежний токен того же пользователя', async () => {
    const firstToken = await issued(USER_ID, EMAIL, NOW);

    await service.issue(USER_ID, 'другой@example.com', NOW.plus({ minutes: 1 }));

    await expect(
      service.consume(firstToken, NOW.plus({ minutes: 2 })),
    ).resolves.toBeNull();
  });

  // Кулдаун повторной отправки (EMAIL_CONFIRM_RESEND_COOLDOWN_MIN): квота
  // Resend — 100 писем в сутки, и «Прислать ссылку ещё раз» без потолка
  // выжигает её на всю школу (ADR-0059, замечание соседней сессии 2026-09-20).
  it('повтор на тот же адрес раньше кулдауна — null, письмо не уходит', async () => {
    await issued(USER_ID, EMAIL, NOW);

    const again = await service.issue(USER_ID, EMAIL, WITHIN_COOLDOWN);

    expect(again).toBeNull();
  });

  it('после кулдауна тот же адрес снова выпускает токен', async () => {
    const first = await issued(USER_ID, EMAIL, NOW);

    const second = await issued(USER_ID, EMAIL, AFTER_COOLDOWN);

    expect(second).not.toBe(first);
    // Прежний сгорел: активная ссылка подтверждения всегда одна.
    await expect(service.consume(first, AFTER_COOLDOWN)).resolves.toBeNull();
  });

  // Смена адреса — другое намерение, а не повтор: ждать там нечего, иначе
  // опечатавшийся человек заперт на две минуты со своей же опечаткой.
  it('другой адрес внутри кулдауна — письмо уходит сразу', async () => {
    await issued(USER_ID, EMAIL, NOW);

    const other = await service.issue(USER_ID, 'другой@example.com', WITHIN_COOLDOWN);

    expect(other).not.toBeNull();
  });

  it('кулдаун у каждого свой — чужая отправка не запирает', async () => {
    await issued(USER_ID, EMAIL, NOW);

    const other = await service.issue(OTHER_USER_ID, EMAIL, WITHIN_COOLDOWN);

    expect(other).not.toBeNull();
  });

  it('разные пользователи не мешают друг другу — оба потребляются своим владельцем', async () => {
    const tokenA = await issued(USER_ID, EMAIL, NOW);
    const tokenB = await issued(OTHER_USER_ID, 'другой@example.com', NOW);

    expect(await service.consume(tokenA, NOW)).toEqual({ userId: USER_ID, email: EMAIL });
    expect(await service.consume(tokenB, NOW)).toEqual({
      userId: OTHER_USER_ID,
      email: 'другой@example.com',
    });
  });
});
