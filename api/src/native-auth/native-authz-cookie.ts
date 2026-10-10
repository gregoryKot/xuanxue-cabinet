// Cookie `native_authz` — привязка попыток входа Daychi к браузеру (ADR-0181,
// профиль Workshop 3c98d4a, «Accepted pending browser authorization
// protection»). Значение — 32 случайных байта, в базе только его sha256; это не
// учётные данные и не признак входа, а лишь «та же вкладка, тот же браузер».
// Одна cookie на браузер, общая для всех его попыток: две вкладки с разными
// попытками держат одну привязку, а попытку выбирает номер в адресе.
//
// Secure всегда, а не только в production, как у `session`: профиль требует
// Secure, а localhost браузеры и так считают безопасным источником.
// Max-Age равен сроку попытки и обновляется каждым `authorize`: привязка без
// живой попытки бесполезна, а сессионная cookie в мобильном браузере, который
// восстанавливает вкладки, жила бы неделями. Попытки того же браузера, начатые
// раньше, истекают раньше последней, поэтому продлённая cookie переживает их все.
import { NATIVE_ATTEMPT_LIFETIME_SEC } from '@xuanxue/shared';
import { readCookie } from '../auth/session-cookie';
import { isNativeSecretFormat, newNativeSecret } from './native-secrets';

export const NATIVE_AUTHZ_COOKIE = 'native_authz';

export interface NativeAuthzBinding {
  value: string;
  /** Строка `Set-Cookie`, которая выдаёт или продлевает привязку. */
  cookie: string;
}

export function buildNativeAuthzCookie(value: string): string {
  return [
    `${NATIVE_AUTHZ_COOKIE}=${value}`,
    'Secure',
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${NATIVE_ATTEMPT_LIFETIME_SEC}`,
  ].join('; ');
}

/** Привязка из заголовка `Cookie`, только нашего формата; иначе `null`. */
export function readNativeAuthzCookie(cookieHeader: string | undefined): string | null {
  const value = readCookie(cookieHeader, NATIVE_AUTHZ_COOKIE);
  return value && isNativeSecretFormat(value) ? value : null;
}

/** Привязка для новой попытки: прежняя этого браузера или новая, если её нет
 * или она не нашего формата. */
export function nativeAuthzBinding(cookieHeader: string | undefined): NativeAuthzBinding {
  const value = readNativeAuthzCookie(cookieHeader) ?? newNativeSecret();
  return { value, cookie: buildNativeAuthzCookie(value) };
}
