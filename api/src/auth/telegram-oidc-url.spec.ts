// Юнит-тест buildTelegramAuthUrl — чистая функция, без Nest.
import { buildTelegramAuthUrl } from './telegram-oidc-url';

const CONFIG = {
  clientId: '123456',
  clientSecret: 'client-secret-value',
  redirectUri: 'https://cabinet.example/login/telegram',
  origin: 'https://cabinet.example',
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
      origin: 'https://cabinet.example',
    });
  });

  // Регрессия 2026-10-29 (ADR-0187): адрес без `origin` oauth.telegram.org
  // отвечает 200 с текстом «origin required», а не страницей входа. Документация
  // про параметр молчит, так что узнали только живой проверкой.
  it('origin передан и закодирован — без него Telegram отвечает «origin required»', () => {
    expect(url.searchParams.get('origin')).toBe('https://cabinet.example');
    expect(url.search).toContain('origin=https%3A%2F%2Fcabinet.example');
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
