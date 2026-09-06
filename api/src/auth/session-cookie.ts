// Cookie сессии руками, без cookie-parser (ADR-0012): формат простой
// (`name=value; Attr; Attr`), внешняя зависимость ради разбора `Cookie:` не
// оправдана.
export const SESSION_COOKIE = 'session';

export interface SessionCookieOptions {
  /** Secure — только когда NODE_ENV=production (ADR-0012): localhost по http
   * без него не получил бы cookie вовсе. */
  secure: boolean;
  maxAgeSec: number;
}

export function buildSessionCookie(
  token: string,
  { secure, maxAgeSec }: SessionCookieOptions,
): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Max-Age=0 истекает cookie немедленно вне зависимости от Secure — отдельная
 * ветка построения строки не нужна, buildSessionCookie с пустым значением
 * даёт тот же результат. */
export function clearSessionCookie(): string {
  return buildSessionCookie('', { secure: false, maxAgeSec: 0 });
}

/** Разбор заголовка `Cookie:` без cookie-parser — значения не url-decode:
 * наши токены base64url-совместимы и в них нет символов, которые URL-кодируют. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
