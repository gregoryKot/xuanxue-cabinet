import {
  buildSessionCookie,
  clearSessionCookie,
  readCookie,
  SESSION_COOKIE,
} from './session-cookie';

describe('buildSessionCookie', () => {
  it('с secure: true содержит Secure и все обязательные атрибуты', () => {
    const cookie = buildSessionCookie('tok', { secure: true, maxAgeSec: 100 });
    expect(cookie).toBe(
      `${SESSION_COOKIE}=tok; HttpOnly; SameSite=Lax; Path=/; Max-Age=100; Secure`,
    );
  });

  it('с secure: false Secure отсутствует (локальная разработка по http)', () => {
    const cookie = buildSessionCookie('tok', { secure: false, maxAgeSec: 100 });
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });
});

describe('clearSessionCookie', () => {
  it('пустое значение и Max-Age=0', () => {
    const cookie = clearSessionCookie();
    expect(cookie).toBe(`${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
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
