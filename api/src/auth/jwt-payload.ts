// Разбор payload JWT БЕЗ проверки подписи — общий для id_token Google
// (google-id-token.ts) и Telegram (telegram-oidc-id-token.ts). Почему подпись
// не нужна, написано там же: токен получен нашим сервером напрямую от token
// endpoint по TLS в обмен на client_secret и PKCE-verifier (OIDC Core §3.1.3.7
// п.6). Одна реализация на двоих — иначе правка разбора (длина, формат) уйдёт
// в один вход и забудется в другом (CLAUDE.md «Одна механика — один компонент»).
//
// Сообщения — для лога сервера, пользователь их не видит: сервис входа на любую
// из веток отвечает одним текстом «не получилось войти» (SECURITY §2).

/** Бросает `Error` с причиной, если токен не похож на JWT или payload — не JSON-объект. */
export function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('id_token: не похож на JWT');
  const payloadPart = parts[1];
  if (!payloadPart) throw new Error('id_token: пустой payload');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new Error('id_token: payload не JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('id_token: payload не объект');
  }
  return parsed as Record<string, unknown>;
}
