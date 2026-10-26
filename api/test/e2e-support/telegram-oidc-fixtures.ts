// Общее для e2e входа через Telegram по OIDC (ADR-0187): telegram-oidc.e2e-spec.ts
// (старт и отказы) и telegram-oidc-login.e2e-spec.ts (вход целиком) делят
// фейковый клиент токена, самодельный id_token и «браузер» — вынесено, чтобы
// каждый спек уместился в лимит файл-храповика (CLAUDE.md «Храповики»), по
// образцу users-fixtures.ts. Реальный oauth.telegram.org в CI недоступен:
// TelegramOidcTokenClient подменяется фейком, который отдаёт id_token с claims
// теста (та же схема, что в google-auth.e2e-spec.ts).
import request from 'supertest';
import { DateTime } from 'luxon';
import { readTelegramOAuthCookie } from '../../src/auth/telegram-oidc-cookie';
import type { TelegramTokenExchangeParams } from '../../src/auth/telegram-oidc-token-client';
import { TEST_BOT_TOKEN, type TestApp } from './create-app';
import { createTelegramInviteHelpers } from './auth-telegram-invite-fixtures';
import { withCsrf } from './http';

/** Числовой id бота = `client_id` и `aud` в id_token. */
export const OIDC_CLIENT_ID = TEST_BOT_TOKEN.split(':')[0] as string;
export const OIDC_CLIENT_SECRET = 'e2e-telegram-client-secret';
/** Telegram ID человека по умолчанию (claim `id`). */
export const OIDC_TELEGRAM_ID = 987_654_321;
const COOKIE_NAME = 'telegram_oauth';

export type Agent = ReturnType<typeof request.agent>;

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

/** Claims образца из документации Telegram; `overrides` меняют только то, что
 * нужно тесту. */
export function oidcClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://oauth.telegram.org',
    aud: OIDC_CLIENT_ID,
    sub: 'opaque-sub-not-a-telegram-id',
    iat: DateTime.utc().toSeconds(),
    exp: DateTime.utc().plus({ minutes: 5 }).toSeconds(),
    id: OIDC_TELEGRAM_ID,
    given_name: 'Анна',
    family_name: 'Петрова',
    ...overrides,
  };
}

export function setCookiesOf(res: request.Response): string[] {
  return (res.headers['set-cookie'] ?? []) as unknown as string[];
}

/** Достаёт `Set-Cookie: telegram_oauth=…` из ответа `start` — бросает явно, если
 * её нет, вместо `!` (CLAUDE.md: non-null assertion — предупреждение). */
export function oauthCookieFrom(res: request.Response): string {
  const found = setCookiesOf(res).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!found) throw new Error('telegram_oauth cookie не найдена в ответе start');
  return found;
}

/** `getApp` — геттер, не значение: вызывается лениво из `it()`, когда
 * `beforeAll` уже присвоил testApp (как в users-fixtures.ts). */
export function createTelegramOidcHarness(getApp: () => TestApp) {
  let nextIdToken: string | null = null;
  let lastExchange: TelegramTokenExchangeParams | null = null;
  const invite = createTelegramInviteHelpers(getApp);

  /** Подменяет TelegramOidcTokenClient в `createTestApp(overrides)`. */
  const tokenClientFake = {
    exchange: (params: TelegramTokenExchangeParams): Promise<string | null> => {
      lastExchange = params;
      return Promise.resolve(nextIdToken);
    },
  };

  /** Что Telegram «ответит» на обмен кода: `null` — отказ. */
  function respondWith(claims: Record<string, unknown> | null): void {
    nextIdToken = claims ? jwt(claims) : null;
  }

  function reset(): void {
    nextIdToken = null;
    lastExchange = null;
  }

  /** Один «браузер»: банка cookie — заявка и сессия живут в ней так же, как у
   * человека, включая гашение cookie заявки ответом (одноразовость). */
  const newAgent = (): Agent => request.agent(invite.server());

  /** `GET start` и `POST` одним агентом — воспроизводит реальный поток без
   * браузера и без сети. */
  async function loginFlow(
    agent: Agent,
    claimsOverrides: Record<string, unknown> = {},
    join?: string,
  ): Promise<{ start: request.Response; login: request.Response }> {
    const query = join ? `?join=${join}` : '';
    const start = await agent.get(`/api/auth/telegram/oidc/start${query}`);
    const stored = readTelegramOAuthCookie(oauthCookieFrom(start).split(';')[0]);
    if (!stored) throw new Error('telegram_oauth cookie не разбирается');

    respondWith(oidcClaims(claimsOverrides));
    const login = await withCsrf(agent.post('/api/auth/telegram/oidc')).send({
      code: 'authorization-code-value',
      state: stored.state,
    });
    return { start, login };
  }

  return {
    server: invite.server,
    users: invite.userModel,
    currentInviteCode: invite.currentInviteCode,
    tokenClientFake,
    respondWith,
    reset,
    lastExchange: (): TelegramTokenExchangeParams | null => lastExchange,
    newAgent,
    loginFlow,
  };
}
