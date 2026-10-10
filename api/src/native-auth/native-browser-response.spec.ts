import { BadRequestException, Logger, type ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  NativeBrowserPageFilter,
  nativeBrowserPageHtml,
  sendNativeBrowserOutcome,
  type NativeBrowserResponseLike,
} from './native-browser-response';

interface FakeResponse extends NativeBrowserResponseLike {
  statusCode?: number;
  headers: Record<string, string | number>;
  body?: string;
}

function fakeResponse(preset: Record<string, string> = {}): FakeResponse {
  const res: FakeResponse = {
    headers: { ...preset },
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[name] = value;
    },
    getHeader(name) {
      return res.headers[name];
    },
    end(body) {
      res.body = body;
    },
  };
  return res;
}

function hostFor(res: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ id: 'req-1' }) }),
  } as unknown as ArgumentsHost;
}

describe('локальная страница входа Daychi', () => {
  it('одна фраза с действием, на русском, без скриптов и стилей', () => {
    const html = nativeBrowserPageHtml();

    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('Вернитесь в приложение Daychi и начните вход заново.');
    expect(html).not.toMatch(/<script|<style|style=/i);
  });

  it('страница — text/html, no-store, без cookie и без Location', () => {
    const res = fakeResponse();

    sendNativeBrowserOutcome(res, { kind: 'page', status: 400 });

    expect(res.statusCode).toBe(400);
    expect(res.headers).toEqual({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Content-Type': 'text/html; charset=utf-8',
    });
    expect(res.body).toBe(nativeBrowserPageHtml());
  });

  it('переход — 302 с Location, cookie только если её дали', () => {
    const plain = fakeResponse();
    const withCookie = fakeResponse();

    sendNativeBrowserOutcome(plain, {
      kind: 'redirect',
      location: '/login/native?attempt=a',
    });
    sendNativeBrowserOutcome(withCookie, {
      kind: 'redirect',
      location: 'su.xuanxue.daychi:/oauth/cabinet?error=access_denied',
      cookie: 'native_authz=v',
    });

    expect(plain.statusCode).toBe(302);
    expect(plain.headers.Location).toBe('/login/native?attempt=a');
    expect(plain.headers['Set-Cookie']).toBeUndefined();
    expect(plain.headers['Cache-Control']).toBe('no-store');
    expect(withCookie.headers['Set-Cookie']).toBe('native_authz=v');
  });
});

describe('NativeBrowserPageFilter', () => {
  const filter = new NativeBrowserPageFilter();

  it('429 троттлера — страница 429 с Retry-After в пределах профиля', () => {
    const res = fakeResponse({ 'Retry-After': '99999' });

    filter.catch(new ThrottlerException(), hostFor(res));

    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe(3600);
    expect(res.body).toBe(nativeBrowserPageHtml());
  });

  it('ошибка запроса — страница 400', () => {
    const res = fakeResponse();

    filter.catch(new BadRequestException(), hostFor(res));

    expect(res.statusCode).toBe(400);
    expect(res.headers.Location).toBeUndefined();
  });

  it('неизвестный сбой — страница 500 и error-лог с кодом обращения', () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const res = fakeResponse();

    filter.catch(new Error('boom'), hostFor(res));

    expect(res.statusCode).toBe(500);
    expect(res.body).toBe(nativeBrowserPageHtml());
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('requestId=req-1'),
      expect.any(String),
    );
    logged.mockRestore();
  });
});
