// Отправка исхода входа из wiki без HTTP-стека: заголовки no-store на любом
// ответе, порядок Set-Cookie → Location у перехода, страница 429 у троттлера.
import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  sendWikiEntryOutcome,
  WIKI_ENTRY_BLOCKED,
  WikiEntryThrottleFilter,
  type WikiEntryResponseLike,
} from './wiki-entry-response';

interface RecordedResponse extends WikiEntryResponseLike {
  headers: Record<string, string | number | string[]>;
  statusCode?: number;
  body?: string;
}

function fakeResponse(): RecordedResponse {
  const res: RecordedResponse = {
    headers: {},
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

describe('sendWikiEntryOutcome', () => {
  it('страница — HTML со статусом исхода и no-store', () => {
    const res = fakeResponse();
    sendWikiEntryOutcome(res, WIKI_ENTRY_BLOCKED);
    expect(res.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('<h1>Доступа нет</h1>');
    expect(res.headers.Location).toBeUndefined();
  });

  it('переход с cookie — 303, оба поля Set-Cookie и Location, тела нет', () => {
    const res = fakeResponse();
    const cookies = ['session=; Max-Age=0', 'session=t; Domain=xuanxue.su'];
    sendWikiEntryOutcome(res, {
      kind: 'redirect',
      location: 'https://wiki.xuanxue.su/a',
      cookies,
    });
    expect(res.statusCode).toBe(HttpStatus.SEE_OTHER);
    expect(res.headers['Set-Cookie']).toEqual(cookies);
    expect(res.headers.Location).toBe('https://wiki.xuanxue.su/a');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toBeUndefined();
  });

  it('переход на вход — без Set-Cookie', () => {
    const res = fakeResponse();
    sendWikiEntryOutcome(res, { kind: 'redirect', location: '/login?returnTo=%2Fwiki' });
    expect(res.statusCode).toBe(HttpStatus.SEE_OTHER);
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});

describe('WikiEntryThrottleFilter', () => {
  it('429 — страница «Не получилось проверить вход» с Retry-After и no-store', () => {
    const res = fakeResponse();
    const host = {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost;
    new WikiEntryThrottleFilter().catch(new ThrottlerException(), host);
    expect(res.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toContain('Не получилось проверить вход');
  });
});
