// Юнит-тест buildTelegramAuthUrl — чистая функция, без Nest.
import { buildTelegramAuthUrl } from './telegram-oidc-url';

const CONFIG = {
  clientId: '123456',
  clientSecret: 'client-secret-value',
  redirectUri: 'https://cabinet.example/login/telegram',
};
const STATE = 's'.repeat(43);
const CHALLENGE = 'c'.repeat(43);

describe('buildTelegramAuthUrl', () => {
  const url = new URL(
    buildTelegramAuthUrl(CONFIG, { state: STATE, challenge: CHALLENGE }),
  );

  it('ведёт на oauth.telegram.org/auth', () => {
    expect(`${url.origin}${url.pathname}`).toBe('https://oauth.telegram.org/auth');
  });

  it('несёт client_id, redirect_uri, код-флоу, state и PKCE S256', () => {
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '123456',
      redirect_uri: 'https://cabinet.example/login/telegram',
      response_type: 'code',
      scope: 'openid profile telegram:bot_access',
      state: STATE,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    });
  });

  it('nonce не отправляется — для кода он необязателен (OIDC Core §3.1.2.1)', () => {
    expect(url.searchParams.has('nonce')).toBe(false);
  });

  it('телефон не запрашивается', () => {
    expect(url.searchParams.get('scope')).not.toContain('phone');
  });

  it('пробелы в scope — %20, как в примере документации Telegram', () => {
    expect(url.search).toContain('scope=openid%20profile%20telegram%3Abot_access');
    expect(url.search).not.toContain('+');
  });
});
