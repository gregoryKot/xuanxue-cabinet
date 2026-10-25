// Номер попытки входа Daychi в этой вкладке (ADR-0181, «Браузер»). Экран
// `/login/native` кладёт его сюда, чтобы любой способ входа — переход вкладки
// в Telegram или Google, код или ссылка из письма в той же вкладке — вернулся
// на тот же экран через postLoginPath (returnTo.ts), а не на главную.
//
// Отдельный ключ, не returnTo: тот не пускает `/login...` (иначе после входа
// человек снова на экране входа), а ослаблять его ради одного экрана — значит
// ослабить для всех способов входа. sessionStorage — по той же причине, что у
// returnTo: ключ живёт ровно в той вкладке, где начат вход, ссылка из письма в
// новой вкладке его не видит и ведёт домой. Номер не секрет: без cookie
// привязки браузера сервер по нему ничего не завершит.
import {
  NATIVE_ATTEMPT_PARAM,
  NATIVE_CANCEL_PARAM,
  NATIVE_CONTINUATION_PATH,
  NATIVE_CONTINUE_ENDPOINT_PATH,
} from '@xuanxue/shared';

const NATIVE_ATTEMPT_KEY = 'xuanxue:nativeAttempt';
/** Номер попытки — ObjectId записи `native_authorizations`, как его пишет сервер. */
const NATIVE_ATTEMPT_ID_RE = /^[0-9a-f]{24}$/;
/** Единственное значение отмены, которое принимает `continue`. */
const NATIVE_CANCEL_VALUE = '1';

export function isNativeAttemptId(value: string | null): value is string {
  return value !== null && NATIVE_ATTEMPT_ID_RE.test(value);
}

/** Запомнить попытку этой вкладки. Не номер или недоступное хранилище
 * (приватный режим) — тихо ничего: вход просто закончится на главной. */
export function saveNativeAttempt(id: string): void {
  if (!isNativeAttemptId(id)) return;
  try {
    sessionStorage.setItem(NATIVE_ATTEMPT_KEY, id);
  } catch {
    // недоступное хранилище — не роняем экран входа
  }
}

/** Прочитать, не снимая: postLoginPath зовут по нескольку раз за один вход
 * (экран возврата и его хук), снимает ключ только переход на `continue`. */
export function peekNativeAttempt(): string | null {
  try {
    const id = sessionStorage.getItem(NATIVE_ATTEMPT_KEY);
    return isNativeAttemptId(id) ? id : null;
  } catch {
    return null;
  }
}

/** Снять ключ — одноразово, перед уходом на `continue`: следующий вход в
 * этой вкладке уже не про Daychi. */
export function consumeNativeAttempt(): string | null {
  const id = peekNativeAttempt();
  try {
    sessionStorage.removeItem(NATIVE_ATTEMPT_KEY);
  } catch {
    // недоступное хранилище — снимать нечего
  }
  return id;
}

/** Адрес экрана `/login/native` этой попытки — куда ведёт postLoginPath. */
export function nativeLoginPath(id: string): string {
  const query = new URLSearchParams([[NATIVE_ATTEMPT_PARAM, id]]);
  return `${NATIVE_CONTINUATION_PATH}?${query.toString()}`;
}

/** Адрес `continue` для полного перехода вкладки; `cancel` — вернуть Daychi
 * `access_denied` без кода. */
export function nativeContinueUrl(
  id: string,
  options: { cancel?: boolean } = {},
): string {
  const query = new URLSearchParams([[NATIVE_ATTEMPT_PARAM, id]]);
  if (options.cancel) query.set(NATIVE_CANCEL_PARAM, NATIVE_CANCEL_VALUE);
  return `${NATIVE_CONTINUE_ENDPOINT_PATH}?${query.toString()}`;
}
