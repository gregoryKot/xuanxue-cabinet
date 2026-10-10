// Обвязка для native-browser-flow.service.spec.ts и native-browser-flow.resume.spec.ts:
// поток без HTTP и без Mongo, попытки — заглушка, сессия есть, если в запросе
// cookie `session`. Ответ сверяется разбором Location: набор параметров callback
// (code/state/iss или error/state/iss) — контракт профиля Workshop 3c98d4a.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { NATIVE_REDIRECT_URI, type NativeCallbackErrorCode } from '@xuanxue/shared';
import type { AuthService } from '../auth/auth.service';
import type { UserLean, UsersService } from '../users/users.service';
import type {
  NativeAuthorizationsService,
  NativeCompleted,
  NativeCompletion,
} from './native-authorizations.service';
import { NATIVE_AUTHZ_COOKIE } from './native-authz-cookie';
import { NativeBrowserFlowService } from './native-browser-flow.service';
import type { NativeBrowserOutcome } from './native-browser-response';
import { sha256Hex } from './native-secrets';

const BINDING = 'b'.repeat(43);
const CODE = 'k'.repeat(43);
const SESSION_TOKEN = 'session-token';
const ISSUER = 'https://staging.xuanxue.su';

export const NOW = DateTime.fromISO('2026-10-10T12:00:00Z', { zone: 'utc' });
export const STATE = 's'.repeat(43);
export const HASH = sha256Hex(BINDING);
export const ATTEMPT = 'a'.repeat(24);
export const TARGET = { issuer: ISSUER, redirectUri: NATIVE_REDIRECT_URI, state: STATE };
export const BAD_REQUEST = { kind: 'page', status: 400 };
export const SESSION = `session=${SESSION_TOKEN}`;
export const BOUND = `${NATIVE_AUTHZ_COOKIE}=${BINDING}`;
export const WITH_CODE = {
  callback: NATIVE_REDIRECT_URI,
  code: CODE,
  state: STATE,
  iss: ISSUER,
};

export function unavailable(): Error {
  return Object.assign(new Error('connect ECONNREFUSED'), {
    name: 'MongoServerSelectionError',
  });
}

/** Сбой внутри попытки: [название, ошибка, код в callback, сколько error-логов]. */
export const FAILURES: [string, Error, NativeCallbackErrorCode, number][] = [
  ['базы нет — без error-лога', unavailable(), 'temporarily_unavailable', 0],
  ['другой сбой — с error-логом', new Error('boom'), 'server_error', 1],
];

export function buildFlow(
  options: { status?: UserLean['status']; publicUrl?: string } = {},
) {
  const user: UserLean = {
    id: 'u1',
    name: 'Мария',
    roles: [],
    status: options.status ?? 'active',
    studentMode: false,
  };
  const authorizations = {
    create: jest.fn().mockResolvedValue(ATTEMPT),
    findPending: jest.fn().mockResolvedValue(TARGET),
    complete: jest.fn((_id: string, _hash: string, completion: NativeCompletion) =>
      Promise.resolve<NativeCompleted | null>(
        'userId' in completion ? { ...TARGET, code: CODE } : TARGET,
      ),
    ),
  };
  const authService = { verifySession: jest.fn().mockReturnValue({ sub: user.id }) };
  const usersService = { findById: jest.fn().mockResolvedValue(user) };
  const config = { get: jest.fn().mockReturnValue(options.publicUrl ?? ISSUER) };
  const flow = new NativeBrowserFlowService(
    authorizations as unknown as NativeAuthorizationsService,
    authService as unknown as AuthService,
    usersService as unknown as UsersService,
    config as unknown as ConfigService,
  );
  return { flow, authorizations };
}

export function flowRequest(path: string, ...cookies: string[]) {
  return {
    id: 'req-1',
    originalUrl: path,
    headers: cookies.length > 0 ? { cookie: cookies.join('; ') } : {},
  };
}

/** Без ветвлений: файл входит в покрытие api. У страницы адреса нет — тест
 * упадёт на сравнении адреса. */
export function locationOf(outcome: NativeBrowserOutcome): URL {
  return new URL(
    (outcome as Extract<NativeBrowserOutcome, { kind: 'redirect' }>).location,
    ISSUER,
  );
}

/** Адрес callback без query и ровно его параметры — одним объектом для `toEqual`. */
export function callbackOf(outcome: NativeBrowserOutcome): Record<string, string> {
  const url = locationOf(outcome);
  return {
    callback: `${url.protocol}${url.pathname}`,
    ...Object.fromEntries(url.searchParams),
  };
}

export function withError(error: NativeCallbackErrorCode): Record<string, string> {
  return { callback: NATIVE_REDIRECT_URI, error, state: STATE, iss: ISSUER };
}

export function spyOnErrorLog(): jest.SpyInstance {
  return jest.spyOn(Logger.prototype, 'error').mockImplementation();
}
