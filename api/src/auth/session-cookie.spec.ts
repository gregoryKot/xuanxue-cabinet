// Профили cookie сессии (ADR-0183) — значения из таблицы контракта Workshop
// web-wiki-session, ревизия 25def59: имя, домен и атрибуты держатся на всём
// пути выпуска, продления и выхода, cookie другого окружения не читается.
import {
  browserLogoutCookies,
  browserSessionCookies,
  buildSessionCookie,
  readCookie,
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieProfile,
} from './session-cookie';

const PRODUCTION = sessionCookieProfile('https://xuanxue.su');
const STAGING = sessionCookieProfile('https://staging.xuanxue.su');
const LOCAL = sessionCookieProfile('http://localhost:3000');

const LEGACY_EXPIRATION_SECURE =
  'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure';

describe('sessionCookieProfile', () => {
  it('профиль — по origin PUBLIC_URL: путь адреса его не меняет', () => {
    expect(sessionCookieProfile('https://xuanxue.su/cabinet')).toEqual(PRODUCTION);
    expect(PRODUCTION.domain).toBe('xuanxue.su');
    expect(STAGING).toMatchObject({
      name: 'session_staging',
      domain: 'staging.xuanxue.su',
    });
  });

  it('другой адрес — host-only session без уборки, Secure только на https', () => {
    for (const url of [undefined, 'http://localhost:3000', 'http://xuanxue.su']) {
      expect(sessionCookieProfile(url)).toEqual({
        name: SESSION_COOKIE,
        domain: null,
        secure: false,
        expiresLegacyHostCookie: false,
      });
    }
    expect(sessionCookieProfile('https://cabinet-pr-1.up.railway.app')).toMatchObject({
      domain: null,
      secure: true,
      expiresLegacyHostCookie: false,
    });
  });

  it('поддомен и www прода — не общий профиль', () => {
    expect(sessionCookieProfile('https://www.xuanxue.su').domain).toBeNull();
    expect(sessionCookieProfile('https://wiki.xuanxue.su').domain).toBeNull();
  });
});

describe('buildSessionCookie', () => {
  it('прод: общая cookie session на Domain=xuanxue.su с Secure', () => {
    expect(buildSessionCookie('tok', PRODUCTION, 100)).toBe(
      'session=tok; HttpOnly; SameSite=Lax; Path=/; Max-Age=100; Domain=xuanxue.su; Secure',
    );
  });

  it('стейджинг: своё имя session_staging на Domain=staging.xuanxue.su', () => {
    expect(buildSessionCookie('tok', STAGING, 100)).toBe(
      'session_staging=tok; HttpOnly; SameSite=Lax; Path=/; Max-Age=100; Domain=staging.xuanxue.su; Secure',
    );
  });

  it('локально: host-only session без Secure (http://localhost)', () => {
    expect(buildSessionCookie('tok', LOCAL, 100)).toBe(
      `${SESSION_COOKIE}=tok; HttpOnly; SameSite=Lax; Path=/; Max-Age=100`,
    );
  });
});

describe('browserSessionCookies', () => {
  it('прод: сначала гасит host-only session, потом ставит общую — двумя полями', () => {
    expect(browserSessionCookies('tok', PRODUCTION, 100)).toEqual([
      LEGACY_EXPIRATION_SECURE,
      buildSessionCookie('tok', PRODUCTION, 100),
    ]);
  });

  it('стейджинг гасит только host-only session без Domain: общая cookie прода остаётся', () => {
    const [legacy, active] = browserSessionCookies('tok', STAGING, 100);
    expect(legacy).toBe(LEGACY_EXPIRATION_SECURE);
    expect(legacy).not.toContain('Domain');
    expect(active).toMatch(/^session_staging=tok;/);
  });

  it('локально — одно поле: host-only session и есть действующая', () => {
    expect(browserSessionCookies('tok', LOCAL, 100)).toEqual([
      buildSessionCookie('tok', LOCAL, 100),
    ]);
  });
});

describe('browserLogoutCookies', () => {
  it('прод гасит и host-only, и общую cookie', () => {
    expect(browserLogoutCookies(PRODUCTION)).toEqual([
      LEGACY_EXPIRATION_SECURE,
      'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Domain=xuanxue.su; Secure',
    ]);
  });

  it('стейджинг не трогает session на Domain=xuanxue.su', () => {
    const cookies = browserLogoutCookies(STAGING);
    expect(cookies).toEqual([
      LEGACY_EXPIRATION_SECURE,
      'session_staging=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Domain=staging.xuanxue.su; Secure',
    ]);
    expect(cookies.join('\n')).not.toContain('Domain=xuanxue.su;');
  });

  it('локально — одно поле с Max-Age=0', () => {
    expect(browserLogoutCookies(LOCAL)).toEqual([
      `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    ]);
  });
});

describe('readSessionToken', () => {
  it('одна cookie своего имени — её значение', () => {
    expect(readSessionToken('a=1; session=tok; b=2', PRODUCTION)).toBe('tok');
    expect(readSessionToken('session_staging=tok', STAGING)).toBe('tok');
  });

  it('две одноимённые cookie в любом порядке — отказ, а не выбор', () => {
    expect(readSessionToken('session=a; session=b', PRODUCTION)).toBeUndefined();
    expect(readSessionToken('session=b; session=a', PRODUCTION)).toBeUndefined();
    expect(
      readSessionToken('session_staging=a; session_staging=b', STAGING),
    ).toBeUndefined();
  });

  it('на стейджинге cookie прода не считается ни сессией, ни повтором', () => {
    expect(readSessionToken('session=prod', STAGING)).toBeUndefined();
    expect(readSessionToken('session=prod; session_staging=tok', STAGING)).toBe('tok');
    expect(
      readSessionToken('session_staging=tok; session=prod; session=old', STAGING),
    ).toBe('tok');
  });

  it('нет заголовка или нужной cookie — undefined', () => {
    expect(readSessionToken(undefined, PRODUCTION)).toBeUndefined();
    expect(readSessionToken('a=1; b=2', PRODUCTION)).toBeUndefined();
  });
});

describe('readCookie', () => {
  it('находит нужную cookie среди нескольких', () => {
    expect(readCookie('a=1; session=tok123; b=2', SESSION_COOKIE)).toBe('tok123');
  });

  it('без заголовка — undefined', () => {
    expect(readCookie(undefined, SESSION_COOKIE)).toBeUndefined();
  });

  it('заголовок есть, но нужной cookie нет — undefined', () => {
    expect(readCookie('a=1; b=2', SESSION_COOKIE)).toBeUndefined();
  });

  it('лишние пробелы вокруг пар не мешают разбору', () => {
    expect(readCookie(' a=1;  session=tok  ; b=2', SESSION_COOKIE)).toBe('tok');
  });
});
