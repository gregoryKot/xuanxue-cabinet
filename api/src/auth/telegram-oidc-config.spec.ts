// Юнит-тест telegramOidcConfig — фейковый ConfigService, без Nest.
import type { ConfigService } from '@nestjs/config';
import { telegramOidcConfig } from './telegram-oidc-config';

const ENV: Record<string, string> = {
  BOT_TOKEN: '123456:abcDEFghi-token_padding_here_xx',
  TELEGRAM_LOGIN_CLIENT_SECRET: 'client-secret-value',
  PUBLIC_URL: 'https://cabinet.example',
};

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('telegramOidcConfig', () => {
  it('все три значения заданы — client_id это числовой id бота, redirect_uri с путём возврата', () => {
    expect(telegramOidcConfig(fakeConfig(ENV))).toEqual({
      clientId: '123456',
      clientSecret: 'client-secret-value',
      redirectUri: 'https://cabinet.example/login/telegram',
    });
  });

  it.each(['BOT_TOKEN', 'TELEGRAM_LOGIN_CLIENT_SECRET', 'PUBLIC_URL'])(
    'без %s — null',
    (missing) => {
      expect(telegramOidcConfig(fakeConfig({ ...ENV, [missing]: undefined }))).toBeNull();
    },
  );

  it('BOT_TOKEN без числового префикса — null', () => {
    expect(telegramOidcConfig(fakeConfig({ ...ENV, BOT_TOKEN: 'не-токен' }))).toBeNull();
  });
});
