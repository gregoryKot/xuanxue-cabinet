// Браузерная часть входа Daychi для e2e (ADR-0181, профиль Workshop «Browser
// authorization and callback»): браузер с cookie и своим IP, параметры PKCE,
// разбор перехода в приложение и обмен кода. Каждый браузер берёт свой адрес —
// троттлер считает запросы без сессии по IP, и тесты файла не делят лимит.
import { createHash, randomBytes } from 'crypto';
import request from 'supertest';
import {
  NATIVE_CHALLENGE_METHOD,
  NATIVE_CLIENT_ID,
  NATIVE_GRANT_TYPE,
  NATIVE_REDIRECT_URI,
  NATIVE_RESPONSE_TYPE,
  NATIVE_SCOPE,
} from '@xuanxue/shared';
import { NATIVE_AUTHZ_COOKIE } from '../../src/native-auth/native-authz-cookie';
import { NATIVE_BASE, type NativeApi } from './native-fixtures';
import { freshIp } from './telegram-widget-fixtures';

export const AUTHORIZE_PATH = '/auth/native/authorize';
export const CONTINUE_PATH = `${NATIVE_BASE}/continue`;
export const TOKEN_PATH = `${NATIVE_BASE}/token`;
/** `PUBLIC_URL` тестового приложения (create-app.ts) — он и есть `iss`. */
export const TEST_ISSUER = 'http://localhost:3000';
export const PAGE_TEXT = 'Вернитесь в приложение Daychi и начните вход заново.';

const base64url = (bytes: Buffer): string => bytes.toString('base64url');

export interface Pkce {
  verifier: string;
  state: string;
  params: Record<string, string>;
}

/** Свежие verifier и state и параметры authorize по профилю. */
export function newPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(32));
  return {
    verifier,
    state,
    params: {
      response_type: NATIVE_RESPONSE_TYPE,
      client_id: NATIVE_CLIENT_ID,
      redirect_uri: NATIVE_REDIRECT_URI,
      scope: NATIVE_SCOPE,
      state,
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: NATIVE_CHALLENGE_METHOD,
    },
  };
}

export function authorizeUrl(params: Record<string, string>, extra = ''): string {
  return `${AUTHORIZE_PATH}?${new URLSearchParams(params).toString()}${extra}`;
}

/** Параметры перехода в приложение; адрес до `?` — ровно redirect URI. */
export function callbackOf(res: request.Response): URLSearchParams {
  expect(res.status).toBe(302);
  const [target, query] = String(res.headers.location).split('?');
  expect(target).toBe(NATIVE_REDIRECT_URI);
  return new URLSearchParams(query);
}

/** Всё, что ставит ответ браузерной части: только привязка, без сессии. */
export function setCookiesOf(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as string | string[] | undefined;
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

export function expectBrowserHeaders(res: request.Response): void {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.pragma).toBe('no-cache');
  for (const cookie of setCookiesOf(res)) {
    expect(cookie.startsWith(`${NATIVE_AUTHZ_COOKIE}=`)).toBe(true);
  }
}

export function expectLocalPage(res: request.Response, status: number): void {
  expect(res.status).toBe(status);
  expect(res.headers.location).toBeUndefined();
  expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
  expect(res.text).toContain(PAGE_TEXT);
  expectBrowserHeaders(res);
}

export interface NativeBrowser {
  /** Cookie браузера: сессия кабинета (если вошёл) и привязка последнего ответа. */
  cookies: Map<string, string>;
  get: (path: string) => Promise<request.Response>;
  authorize: (
    params: Record<string, string>,
    extra?: string,
  ) => Promise<request.Response>;
}

export function nativeBrowser(api: NativeApi, session?: string): NativeBrowser {
  const ip = freshIp();
  const cookies = new Map<string, string>();
  if (session !== undefined) cookies.set('session', session);
  const get = async (path: string): Promise<request.Response> => {
    const res = await request(api.server())
      .get(path)
      .set('x-forwarded-for', ip)
      .set('Cookie', [...cookies.values()].join('; '));
    for (const cookie of setCookiesOf(res)) {
      cookies.set(NATIVE_AUTHZ_COOKIE, cookie.split(';')[0] ?? '');
    }
    return res;
  };
  return {
    cookies,
    get,
    authorize: (params, extra) => get(authorizeUrl(params, extra)),
  };
}

/** Номер попытки из перехода на экран входа кабинета. */
export function attemptOf(res: request.Response): string {
  expect(res.status).toBe(302);
  const match = /^\/login\/native\?attempt=([0-9a-f]{24})$/.exec(
    String(res.headers.location),
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

export function exchangeForm(code: string, verifier: string): string {
  return new URLSearchParams({
    grant_type: NATIVE_GRANT_TYPE,
    client_id: NATIVE_CLIENT_ID,
    redirect_uri: NATIVE_REDIRECT_URI,
    code,
    code_verifier: verifier,
  }).toString();
}

export function exchange(api: NativeApi, form: string): request.Test {
  return request(api.server())
    .post(TOKEN_PATH)
    .set('x-forwarded-for', freshIp())
    .type('form')
    .send(form);
}
