// Адреса браузерной части входа Daychi (ADR-0181, профиль Workshop 3c98d4a,
// «Browser authorization and callback»): разбор query `authorize` и `continue`,
// сборка callback и адреса экрана входа. Query разбирается из сырого `req.url`:
// Express схлопывает повтор имени и не отличает его от одиночного, а повтор
// любого параметра профиль велит отвергать.
//
// Порядок проверок `authorize` — часть контракта: пока клиент, redirect URI и
// state не подтверждены, ответа в callback нет вовсе (N03) — только локальная
// страница 400. После этого любая другая ошибка уходит в callback.
import {
  NATIVE_ATTEMPT_PARAM,
  NATIVE_CANCEL_PARAM,
  NATIVE_CHALLENGE_METHOD,
  NATIVE_CLIENT_ID,
  NATIVE_CONTINUATION_PATH,
  NATIVE_REDIRECT_URI,
  NATIVE_RESPONSE_TYPE,
  NATIVE_SCOPE,
  type NativeCallbackErrorCode,
} from '@xuanxue/shared';
import { isNativeSecretFormat } from './native-secrets';

const AUTHORIZE_PARAMS: ReadonlySet<string> = new Set([
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
]);
const CONTINUE_PARAMS: ReadonlySet<string> = new Set([
  NATIVE_ATTEMPT_PARAM,
  NATIVE_CANCEL_PARAM,
]);
const CANCEL_VALUE = '1';

interface NativeAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}

export type NativeAuthorizeQuery =
  | { kind: 'rejected' }
  | { kind: 'error'; error: NativeCallbackErrorCode; state: string }
  | { kind: 'valid'; request: NativeAuthorizeRequest };

export interface NativeContinueQuery {
  attemptId: string;
  cancel: boolean;
}

export type NativeCallbackResult = { code: string } | { error: NativeCallbackErrorCode };

const REJECTED: NativeAuthorizeQuery = { kind: 'rejected' };

/** Параметры query без повторов; любой повтор — `null`. */
function uniqueParams(url: string | undefined): Map<string, string> | null {
  const raw = url ?? '';
  const start = raw.indexOf('?');
  const params = new Map<string, string>();
  if (start === -1) return params;
  for (const [name, value] of new URLSearchParams(raw.slice(start + 1))) {
    if (params.has(name)) return null;
    params.set(name, value);
  }
  return params;
}

function hasOnly(params: Map<string, string>, allowed: ReadonlySet<string>): boolean {
  return [...params.keys()].every((name) => allowed.has(name));
}

function authorizeError(params: Map<string, string>): NativeCallbackErrorCode | null {
  if (params.get('response_type') !== NATIVE_RESPONSE_TYPE) {
    return 'unsupported_response_type';
  }
  if (params.get('scope') !== NATIVE_SCOPE) return 'invalid_scope';
  const challenge = params.get('code_challenge') ?? '';
  const isWellFormed =
    isNativeSecretFormat(challenge) &&
    params.get('code_challenge_method') === NATIVE_CHALLENGE_METHOD &&
    hasOnly(params, AUTHORIZE_PARAMS);
  return isWellFormed ? null : 'invalid_request';
}

export function parseAuthorizeQuery(url: string | undefined): NativeAuthorizeQuery {
  const params = uniqueParams(url);
  const state = params?.get('state') ?? '';
  if (
    !params ||
    params.get('client_id') !== NATIVE_CLIENT_ID ||
    params.get('redirect_uri') !== NATIVE_REDIRECT_URI ||
    !isNativeSecretFormat(state)
  ) {
    return REJECTED;
  }
  const error = authorizeError(params);
  if (error) return { kind: 'error', error, state };
  return {
    kind: 'valid',
    request: {
      clientId: NATIVE_CLIENT_ID,
      redirectUri: NATIVE_REDIRECT_URI,
      scope: NATIVE_SCOPE,
      state,
      codeChallenge: params.get('code_challenge') ?? '',
    },
  };
}

/** `continue?attempt=<id>[&cancel=1]` и ничего больше; иначе `null`. Формат
 * номера попытки проверяет сервис: чужой номер и битый неотличимы. */
export function parseContinueQuery(url: string | undefined): NativeContinueQuery | null {
  const params = uniqueParams(url);
  if (!params || !hasOnly(params, CONTINUE_PARAMS)) return null;
  const attemptId = params.get(NATIVE_ATTEMPT_PARAM);
  const cancel = params.get(NATIVE_CANCEL_PARAM);
  if (!attemptId || (cancel !== undefined && cancel !== CANCEL_VALUE)) return null;
  return { attemptId, cancel: cancel === CANCEL_VALUE };
}

/** Callback ровно с `code`, `state`, `iss` или `error`, `state`, `iss`, значения
 * закодированы как компоненты query. */
export function nativeCallbackUrl(
  target: { redirectUri: string; state: string; issuer: string },
  result: NativeCallbackResult,
): string {
  const first: [string, string] =
    'code' in result ? ['code', result.code] : ['error', result.error];
  const query = new URLSearchParams([
    first,
    ['state', target.state],
    ['iss', target.issuer],
  ]);
  return `${target.redirectUri}?${query.toString()}`;
}

/** Относительный адрес экрана входа: браузер остаётся на том же сайте. */
export function nativeContinuationPath(attemptId: string): string {
  const query = new URLSearchParams([[NATIVE_ATTEMPT_PARAM, attemptId]]);
  return `${NATIVE_CONTINUATION_PATH}?${query.toString()}`;
}
