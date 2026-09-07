// Юнит-спек гварда без HTTP-стека и без Mongo (CLAUDE.md «Тесты» — чистая
// логика). Фейковый ConfigService и ExecutionContext, как в auth.guard.spec.ts.
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ForbiddenError, NotAvailableError } from '../common/errors';
import type { RequestLike } from '../common/http-headers';
import { TELEGRAM_SECRET_HEADER, TelegramWebhookGuard } from './telegram-webhook.guard';

const SECRET = 'valid-secret-token';
const BOT_TOKEN = '123456:fake-token-not-real';

function fakeConfig(values: {
  TELEGRAM_WEBHOOK_SECRET?: string;
  BOT_TOKEN?: string;
}): ConfigService {
  return {
    get: (key: string) => values[key as keyof typeof values],
  } as unknown as ConfigService;
}

function fakeContext(
  headers: Record<string, string | string[] | undefined>,
): ExecutionContext {
  const request: RequestLike = { method: 'POST', headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TelegramWebhookGuard', () => {
  it('TELEGRAM_WEBHOOK_SECRET не задан в env — 503, а не 403', () => {
    const guard = new TelegramWebhookGuard(fakeConfig({ BOT_TOKEN }));
    expect(() =>
      guard.canActivate(fakeContext({ [TELEGRAM_SECRET_HEADER]: SECRET })),
    ).toThrow(NotAvailableError);
  });

  it('BOT_TOKEN не задан в env — тоже 503, а не 403 (без токена бот не смог бы ответить)', () => {
    const guard = new TelegramWebhookGuard(
      fakeConfig({ TELEGRAM_WEBHOOK_SECRET: SECRET }),
    );
    expect(() =>
      guard.canActivate(fakeContext({ [TELEGRAM_SECRET_HEADER]: SECRET })),
    ).toThrow(NotAvailableError);
  });

  it('заголовок отсутствует — 403', () => {
    const guard = new TelegramWebhookGuard(
      fakeConfig({ TELEGRAM_WEBHOOK_SECRET: SECRET, BOT_TOKEN }),
    );
    expect(() => guard.canActivate(fakeContext({}))).toThrow(ForbiddenError);
  });

  it('заголовок не совпадает с секретом — 403', () => {
    const guard = new TelegramWebhookGuard(
      fakeConfig({ TELEGRAM_WEBHOOK_SECRET: SECRET, BOT_TOKEN }),
    );
    expect(() =>
      guard.canActivate(fakeContext({ [TELEGRAM_SECRET_HEADER]: 'чужой-секрет' })),
    ).toThrow(ForbiddenError);
  });

  it('заголовок другой длины не совпадает — 403 (не падает на timingSafeEqual)', () => {
    const guard = new TelegramWebhookGuard(
      fakeConfig({ TELEGRAM_WEBHOOK_SECRET: SECRET, BOT_TOKEN }),
    );
    expect(() =>
      guard.canActivate(fakeContext({ [TELEGRAM_SECRET_HEADER]: 'short' })),
    ).toThrow(ForbiddenError);
  });

  it('заголовок совпадает — пропускает', () => {
    const guard = new TelegramWebhookGuard(
      fakeConfig({ TELEGRAM_WEBHOOK_SECRET: SECRET, BOT_TOKEN }),
    );
    expect(guard.canActivate(fakeContext({ [TELEGRAM_SECRET_HEADER]: SECRET }))).toBe(
      true,
    );
  });

  it('дублирующийся заголовок (массив) — берётся первое значение', () => {
    const guard = new TelegramWebhookGuard(
      fakeConfig({ TELEGRAM_WEBHOOK_SECRET: SECRET, BOT_TOKEN }),
    );
    expect(
      guard.canActivate(fakeContext({ [TELEGRAM_SECRET_HEADER]: [SECRET, 'ещё'] })),
    ).toBe(true);
  });
});
