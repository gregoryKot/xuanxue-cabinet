// Проводной контракт входа нативного Daychi (ADR-0181) — профиль Workshop
// `native-account-session.md`, ревизия 3c98d4a. Имена полей — snake_case, как в
// профиле: это не наш выбор, а граница с другим проектом. Все значения здесь
// закреплены профилем и меняются только новой его ревизией.
import type { MeDto } from './me';

export const NATIVE_CLIENT_ID = 'daychi-native';
export const NATIVE_SCOPE = 'account:read';
export const NATIVE_TOKEN_TYPE = 'Bearer';
/** Единственное значение подсказки в `revoke` (RFC 7009), других профиль не знает. */
export const NATIVE_TOKEN_TYPE_HINT = 'access_token';

/** Единственный зарегистрированный callback, сверяется до символа (одна косая черта). */
export const NATIVE_REDIRECT_URI = 'su.xuanxue.daychi:/oauth/cabinet';
export const NATIVE_RESPONSE_TYPE = 'code';
export const NATIVE_GRANT_TYPE = 'authorization_code';
export const NATIVE_CHALLENGE_METHOD = 'S256';
/** Код из callback годен, пока время сервера строго меньше выдачи + 60 секунд. */
export const NATIVE_CODE_LIFETIME_SEC = 60;
/** Попытка входа живёт 900 секунд от создания; вход и продолжение срок не двигают. */
export const NATIVE_ATTEMPT_LIFETIME_SEC = 900;

/** Экран кабинета, куда браузер уходит войти, если сессии нет. Номер попытки —
 * параметром `attempt`; им же `continue` выбирает попытку, `cancel=1` её отменяет. */
export const NATIVE_CONTINUATION_PATH = '/login/native';
export const NATIVE_ATTEMPT_PARAM = 'attempt';
export const NATIVE_CANCEL_PARAM = 'cancel';
/** Адрес сервера, на который экран `/login/native` уходит полным переходом
 * вкладки, не `apiFetch`: ответ — 302 в Daychi или обратно на экран входа. */
export const NATIVE_CONTINUE_ENDPOINT_PATH = '/api/auth/native/continue';

/** 90 дней; считается от выдачи самого bearer, продление отсчитывает заново. */
export const NATIVE_CREDENTIAL_LIFETIME_SEC = 7_776_000;
/** Продлевать можно, когда возраст bearer СТРОГО больше этого порога (7 дней). */
export const NATIVE_RENEW_THRESHOLD_SEC = 604_800;

export const NATIVE_ERROR_CODES = [
  'invalid_request',
  'invalid_token',
  'account_blocked',
  'rate_limited',
  'temporarily_unavailable',
  'server_error',
  'invalid_client',
  'invalid_grant',
  'unsupported_grant_type',
] as const;

export type NativeErrorCode = (typeof NATIVE_ERROR_CODES)[number];

/** Ошибки, которые уходят в Daychi через callback, а не телом ответа API. */
export const NATIVE_CALLBACK_ERROR_CODES = [
  'invalid_request',
  'unsupported_response_type',
  'invalid_scope',
  'access_denied',
  'temporarily_unavailable',
  'server_error',
] as const;

export type NativeCallbackErrorCode = (typeof NATIVE_CALLBACK_ERROR_CODES)[number];

export interface NativeTokenInput {
  grant_type: string;
  client_id: string;
  redirect_uri: string;
  code: string;
  code_verifier: string;
}

export interface NativeTokenResponse {
  access_token: string;
  token_type: typeof NATIVE_TOKEN_TYPE;
  expires_in: number;
  scope: typeof NATIVE_SCOPE;
  session_id: string;
  renew_after: number;
}

export interface NativeAccountResponse {
  /** Тот же `MeDto`, что отдаёт веб: совпадение с вебом — условие профиля (N01). */
  account: MeDto;
  session: { id: string; expires_in: number; renew_after: number };
}

export interface NativeRevokeInput {
  client_id: string;
  token: string;
  token_type_hint?: typeof NATIVE_TOKEN_TYPE_HINT;
}
