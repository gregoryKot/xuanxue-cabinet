// Юнит-тест чистой проверки виджета — без БД, без HTTP (CLAUDE.md «Тесты»,
// уровень «чистая логика»). Подпись считаем тем же алгоритмом, что и
// production-код: тестовый BOT_TOKEN генерируется randomBytes на каждый
// прогон, литерала секрета в коде нет (gitleaks).
import { createHash, createHmac, randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { isValidTelegramLogin, TELEGRAM_AUTH_MAX_AGE_SEC } from './telegram-login';

function testBotToken(): string {
  return `123456:${randomBytes(18).toString('hex').slice(0, 35)}`;
}

function sign(fields: Record<string, unknown>, botToken: string): string {
  const dataCheckString = Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

function validBody(
  botToken: string,
  now: DateTime,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    id: 42,
    first_name: 'Дима',
    auth_date: Math.floor(now.toSeconds()),
    ...overrides,
  };
  return { ...fields, hash: sign(fields, botToken) };
}

describe('isValidTelegramLogin', () => {
  it('верная подпись и свежий auth_date — true', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    expect(isValidTelegramLogin(validBody(botToken, now), botToken, now)).toBe(true);
  });

  it('лишнее поле, подписанное вместе с остальными, — true', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const body = validBody(botToken, now, { photo_url: 'https://t.me/i/photo.jpg' });
    expect(isValidTelegramLogin(body, botToken, now)).toBe(true);
  });

  it('подменённое поле после подписи — false', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const body = validBody(botToken, now, { first_name: 'Дима' });
    const tampered = { ...body, first_name: 'Другой' };
    expect(isValidTelegramLogin(tampered, botToken, now)).toBe(false);
  });

  it('незамеченное лишнее поле, добавленное уже после подписи, — false', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const body = validBody(botToken, now);
    const tampered = { ...body, username: 'подменыш' };
    expect(isValidTelegramLogin(tampered, botToken, now)).toBe(false);
  });

  it('auth_date старше TELEGRAM_AUTH_MAX_AGE_SEC — false', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const staleAuthDate = Math.floor(now.toSeconds()) - TELEGRAM_AUTH_MAX_AGE_SEC - 1;
    const body = validBody(botToken, now, { auth_date: staleAuthDate });
    expect(isValidTelegramLogin(body, botToken, now)).toBe(false);
  });

  it('auth_date в будущем относительно now — false', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const futureAuthDate = Math.floor(now.toSeconds()) + 60;
    const body = validBody(botToken, now, { auth_date: futureAuthDate });
    expect(isValidTelegramLogin(body, botToken, now)).toBe(false);
  });

  it('auth_date не числом (после подмены типа) — false', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const body = validBody(botToken, now);
    const tampered = { ...body, auth_date: String(body.auth_date) };
    expect(isValidTelegramLogin(tampered, botToken, now)).toBe(false);
  });

  it('hash другой длины — false, без исключения из timingSafeEqual', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const body = { ...validBody(botToken, now), hash: 'ab'.repeat(10) };
    expect(() => isValidTelegramLogin(body, botToken, now)).not.toThrow();
    expect(isValidTelegramLogin(body, botToken, now)).toBe(false);
  });

  it('hash отсутствует или не строка — false', () => {
    const botToken = testBotToken();
    const now = DateTime.utc();
    const { hash: _hash, ...withoutHash } = validBody(botToken, now);
    expect(isValidTelegramLogin(withoutHash, botToken, now)).toBe(false);
  });

  it('верная подпись, но другой BOT_TOKEN на проверке — false', () => {
    const botToken = testBotToken();
    const otherToken = testBotToken();
    const now = DateTime.utc();
    const body = validBody(botToken, now);
    expect(isValidTelegramLogin(body, otherToken, now)).toBe(false);
  });
});
