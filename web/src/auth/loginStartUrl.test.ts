// Один сборщик адреса старта на Google и Telegram (loginStartUrl.ts): проверяем
// его на путях обоих провайдеров — разъехаться им теперь негде, но подмена
// пути не должна менять правила кодирования кода приглашения.
import { describe, expect, it } from 'vitest';
import { GOOGLE_LOGIN_START_PATH, TELEGRAM_OIDC_START_PATH } from '@xuanxue/shared';
import { loginStartUrl } from './loginStartUrl';

describe('loginStartUrl', () => {
  it.each([
    [GOOGLE_LOGIN_START_PATH, '/api/auth/google/start'],
    [TELEGRAM_OIDC_START_PATH, '/api/auth/telegram/oidc/start'],
  ])('%s без кода приглашения — путь без query', (startPath, expected) => {
    expect(loginStartUrl(startPath)).toBe(expected);
  });

  it.each([
    [GOOGLE_LOGIN_START_PATH, '/api/auth/google/start'],
    [TELEGRAM_OIDC_START_PATH, '/api/auth/telegram/oidc/start'],
  ])('%s с кодом приглашения — join в query', (startPath, expected) => {
    expect(loginStartUrl(startPath, 'a'.repeat(32))).toBe(
      `${expected}?join=${'a'.repeat(32)}`,
    );
  });

  it('код с символами, которые нужно кодировать', () => {
    const url = loginStartUrl(TELEGRAM_OIDC_START_PATH, 'код с пробелом');
    expect(new URL(url, 'https://xuanxue.su').searchParams.get('join')).toBe(
      'код с пробелом',
    );
  });

  it('пустой код приглашения — как будто его нет', () => {
    expect(loginStartUrl(TELEGRAM_OIDC_START_PATH, '')).toBe(
      '/api/auth/telegram/oidc/start',
    );
  });
});
