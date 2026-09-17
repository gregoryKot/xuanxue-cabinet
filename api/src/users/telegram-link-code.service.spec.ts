// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): уникальный индекс codeHash и TTL-индекс expiresAt должны
// действительно существовать и работать. Время — фиксированные DateTime, не
// DateTime.utc() (CLAUDE.md «Детерминизм»).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { TELEGRAM_LINK_CODE_RE, TELEGRAM_LINK_START_PREFIX } from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import type { BotIdentityService } from '../telegram/bot-identity.service';
import {
  TelegramLinkCodeRecord,
  TelegramLinkCodeSchema,
} from './telegram-link-code.schema';
import {
  TELEGRAM_LINK_CODE_TTL_MIN,
  TelegramLinkCodeService,
} from './telegram-link-code.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-16T10:00:00.000Z', { zone: 'utc' });
// Валидные ObjectId-строки — userId в схеме типизирован SchemaTypes.ObjectId,
// произвольная строка вроде 'u1' не кастуется и падает CastError.
const USER_ID = '68c9a000a000a000a000a001';
const OTHER_USER_ID = '68c9a000a000a000a000a002';

function fakeBotIdentity(username: string | undefined): BotIdentityService {
  return { get: () => username } as unknown as BotIdentityService;
}

function codeFromUrl(telegramUrl: string): string {
  const [, code] = telegramUrl.split(`start=${TELEGRAM_LINK_START_PREFIX}`);
  return code ?? '';
}

describe('TelegramLinkCodeService', () => {
  let memory: MemoryMongo;
  let model: Model<TelegramLinkCodeRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<TelegramLinkCodeRecord>(
      TelegramLinkCodeRecord.name,
      TelegramLinkCodeSchema,
    );
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('issueLink: собирает ссылку с кодом в формате TELEGRAM_LINK_CODE_RE', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);

    const { telegramUrl } = await service.issueLink(USER_ID, NOW);

    expect(telegramUrl).toMatch(
      /^https:\/\/t\.me\/xuanxue_bot\?start=link_[0-9a-f]{32}$/,
    );
    expect(codeFromUrl(telegramUrl)).toMatch(TELEGRAM_LINK_CODE_RE);
  });

  it('issueLink: бот не прогрелся — NotAvailableError', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity(undefined), model);

    await expect(service.issueLink(USER_ID, NOW)).rejects.toBeInstanceOf(
      NotAvailableError,
    );
  });

  it('issueLink → consume: read-after-write, возвращает userId владельца', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);
    const { telegramUrl } = await service.issueLink(USER_ID, NOW);

    const userId = await service.consume(
      codeFromUrl(telegramUrl),
      NOW.plus({ minutes: 1 }),
    );

    expect(userId).toBe(USER_ID);
  });

  it('consume: тот же код второй раз — null, одноразовость', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);
    const code = codeFromUrl((await service.issueLink(USER_ID, NOW)).telegramUrl);

    const first = await service.consume(code, NOW);
    const second = await service.consume(code, NOW);

    expect(first).toBe(USER_ID);
    expect(second).toBeNull();
  });

  it('consume: неизвестный код — null', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);

    await expect(service.consume('a'.repeat(32), NOW)).resolves.toBeNull();
  });

  it('consume: протухший (старше TTL) — null', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);
    const code = codeFromUrl((await service.issueLink(USER_ID, NOW)).telegramUrl);

    const userId = await service.consume(
      code,
      NOW.plus({ minutes: TELEGRAM_LINK_CODE_TTL_MIN, seconds: 1 }),
    );

    expect(userId).toBeNull();
  });

  it('consume: ровно на границе TTL — ещё действует ($gt строгий, но граница не задета)', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);
    const code = codeFromUrl((await service.issueLink(USER_ID, NOW)).telegramUrl);

    const userId = await service.consume(
      code,
      NOW.plus({ minutes: TELEGRAM_LINK_CODE_TTL_MIN }).minus({ seconds: 1 }),
    );

    expect(userId).toBe(USER_ID);
  });

  it('issueLink: повторный вызов удаляет прежний код того же пользователя', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);
    const firstCode = codeFromUrl((await service.issueLink(USER_ID, NOW)).telegramUrl);

    await service.issueLink(USER_ID, NOW.plus({ minutes: 1 }));

    await expect(
      service.consume(firstCode, NOW.plus({ minutes: 2 })),
    ).resolves.toBeNull();
  });

  it('issueLink: разные пользователи не мешают друг другу — оба потребляются', async () => {
    const service = new TelegramLinkCodeService(fakeBotIdentity('xuanxue_bot'), model);
    const codeA = codeFromUrl((await service.issueLink(USER_ID, NOW)).telegramUrl);
    const codeB = codeFromUrl((await service.issueLink(OTHER_USER_ID, NOW)).telegramUrl);

    expect(await service.consume(codeA, NOW)).toBe(USER_ID);
    expect(await service.consume(codeB, NOW)).toBe(OTHER_USER_ID);
  });
});
