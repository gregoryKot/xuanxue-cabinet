// Cookie сессии руками, без cookie-parser (ADR-0012): формат простой
// (`name=value; Attr; Attr`), внешняя зависимость ради разбора `Cookie:` не
// оправдана. Имя, домен и уборка прежней cookie — по профилю окружения
// (ADR-0183, контракт Workshop web-wiki-session): прод делит сессию с
// wiki.xuanxue.su, стейджинг — с wiki.staging.xuanxue.su, и cookie одного
// окружения другое не читает, не продлевает и не стирает.
import type { DeployProfile } from '../config/env.validation';

/** Имя host-only cookie, которую кабинет выдавал до общих профилей; оно же —
 * действующее имя прода и локальной разработки. */
export const SESSION_COOKIE = 'session';

/** Токен DI-провайдера профиля — фабрика в auth.module.ts, из DEPLOY_PROFILE. */
export const SESSION_PROFILE = 'SESSION_PROFILE';

export interface SessionCookieProfile {
  name: string;
  /** `null` — host-only: cookie видит только адрес, который её выдал. */
  domain: string | null;
  /** Без Secure локальный http://localhost не получил бы cookie вовсе. */
  secure: boolean;
  /** Ответы входа, продления и выхода стирают прежнюю host-only `session`,
   * чтобы рядом с общей cookie не осталось второй сессии. У `local` её нет:
   * там действующая cookie и есть host-only `session`. */
  expiresLegacyHostCookie: boolean;
}

const PROFILES: Record<DeployProfile, SessionCookieProfile> = {
  production: {
    name: SESSION_COOKIE,
    domain: 'xuanxue.su',
    secure: true,
    expiresLegacyHostCookie: true,
  },
  staging: {
    name: 'session_staging',
    domain: 'staging.xuanxue.su',
    secure: true,
    expiresLegacyHostCookie: true,
  },
  local: {
    name: SESSION_COOKIE,
    domain: null,
    secure: false,
    expiresLegacyHostCookie: false,
  },
};

export function sessionCookieProfile(profile: DeployProfile): SessionCookieProfile {
  return PROFILES[profile];
}

function buildCookie(
  name: string,
  value: string,
  {
    domain,
    secure,
    maxAgeSec,
  }: { domain: string | null; secure: boolean; maxAgeSec: number },
): string {
  const attrs = [
    `${name}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ];
  if (domain) attrs.push(`Domain=${domain}`);
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Одно поле `Set-Cookie` действующей сессии, без уборки прежней. */
export function buildSessionCookie(
  token: string,
  profile: SessionCookieProfile,
  maxAgeSec: number,
): string {
  return buildCookie(profile.name, token, { ...profile, maxAgeSec });
}

/** Max-Age=0 без Domain стирает только host-only cookie этого адреса: общая
 * cookie прода с Domain=xuanxue.su на стейджинге остаётся нетронутой. */
function legacyHostExpiration(profile: SessionCookieProfile): string[] {
  if (!profile.expiresLegacyHostCookie) return [];
  return [
    buildCookie(SESSION_COOKIE, '', {
      domain: null,
      secure: profile.secure,
      maxAgeSec: 0,
    }),
  ];
}

/** Поля `Set-Cookie` браузерного ответа кабинета, который выдаёт сессию (вход,
 * продление): уборка прежней host-only cookie и действующая — отдельными
 * полями, массивом для `setHeader`. */
export function browserSessionCookies(
  token: string,
  profile: SessionCookieProfile,
  maxAgeSec: number,
): string[] {
  return [
    ...legacyHostExpiration(profile),
    buildSessionCookie(token, profile, maxAgeSec),
  ];
}

/** Поля `Set-Cookie` выхода: гасят и действующую, и прежнюю host-only. */
export function browserLogoutCookies(profile: SessionCookieProfile): string[] {
  return [...legacyHostExpiration(profile), buildSessionCookie('', profile, 0)];
}

function cookieValues(header: string | undefined, name: string): string[] {
  if (!header) return [];
  const values: string[] = [];
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) values.push(part.slice(eq + 1).trim());
  }
  return values;
}

/** Разбор заголовка `Cookie:` без cookie-parser — значения не url-decode:
 * наши токены base64url-совместимы и в них нет символов, которые URL-кодируют. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  return cookieValues(header, name)[0];
}

/** Токен сессии профиля — только если cookie его имени ровно одна. Две
 * одноимённые cookie (host-only и общая) — отказ, а не выбор первой или
 * последней: по заголовку `Cookie:` не видно, какая из них свежее. Cookie
 * другого окружения не считается. */
export function readSessionToken(
  header: string | undefined,
  profile: SessionCookieProfile,
): string | undefined {
  const values = cookieValues(header, profile.name);
  return values.length === 1 ? values[0] : undefined;
}
