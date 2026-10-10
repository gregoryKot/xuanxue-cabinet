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
