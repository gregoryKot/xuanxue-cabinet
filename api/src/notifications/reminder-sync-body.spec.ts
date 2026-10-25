// Граница HTTP у записи напоминаний (ADR-0185): какие запросы читает сырой
// парсер и что `readReminderPatch` делает с типом и текстом тела. Сквозной путь
// (глобальный JSON-парсер пропускает уже прочитанное тело, 413 в конверте
// кабинета) — api/test/reminder-sync-write.e2e-spec.ts.
import { InvalidInputError, UnsupportedMediaTypeError } from '../common/errors';
import { isReminderSyncPatch, readReminderPatch } from './reminder-sync-body';

const ID = 'a'.repeat(24);
const GOOD = JSON.stringify({
  version: 1,
  changes: [{ kind: 'class', id: ID, selected: true }],
});

function read(contentType: string | undefined, body: unknown): unknown {
  return readReminderPatch({
    headers: contentType === undefined ? {} : { 'content-type': contentType },
    body,
  });
}

describe('isReminderSyncPatch: только PATCH на маршрут записи', () => {
  const PATH = '/api/me/notifications/lessons/sync';

  it.each([
    ['PATCH', PATH],
    ['patch', PATH],
    ['PATCH', `${PATH}/`],
    ['PATCH', `${PATH}?x=1`],
    ['PATCH', '/API/ME/NOTIFICATIONS/LESSONS/SYNC'],
  ])('%s %s — да', (method, url) => {
    expect(isReminderSyncPatch({ method, url, headers: {} })).toBe(true);
  });

  it.each([
    ['GET', PATH],
    ['PUT', PATH],
    ['POST', PATH],
    ['PATCH', '/api/me/notifications/lessons'],
    ['PATCH', `${PATH}/extra`],
    ['PATCH', '/api/me/notifications'],
    ['PATCH', '/api/me/notifications/lessons/scope'],
    ['PATCH', `/other${PATH}`],
    [undefined, PATH],
  ])('%s %s — нет', (method, url) => {
    expect(isReminderSyncPatch({ method, url, headers: {} })).toBe(false);
  });

  it('не зависит от Content-Type: чужой тип тоже читается сырым', () => {
    expect(
      isReminderSyncPatch({
        method: 'PATCH',
        url: PATH,
        headers: { 'content-type': 'text/plain' },
      }),
    ).toBe(true);
  });
});

describe('readReminderPatch: тип тела', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'application/json;charset=UTF-8',
    'Application/JSON ; Charset = "utf-8"',
  ])('%s — принимается', (type) => {
    expect(read(type, Buffer.from(GOOD))).toEqual([
      { kind: 'class', id: ID, selected: true },
    ]);
  });

  it.each([
    [undefined],
    [''],
    ['text/plain'],
    ['text/plain; charset=utf-8'],
    ['application/x-www-form-urlencoded'],
    ['multipart/form-data; boundary=x'],
    ['application/json; charset=latin1'],
    ['application/json; charset=utf-16'],
    ['application/json; boundary=x'],
    ['application/json; charset=utf-8; boundary=x'],
    ['application/jsonx'],
    ['application/merge-patch+json'],
    ['application/json, text/plain'],
  ])('%j — 415, тело не разбирается', (type) => {
    expect(() => read(type, Buffer.from(GOOD))).toThrow(UnsupportedMediaTypeError);
  });

  it('повторённый Content-Type (массив) — 415', () => {
    expect(() =>
      readReminderPatch({
        headers: { 'content-type': ['application/json', 'application/json'] },
        body: Buffer.from(GOOD),
      }),
    ).toThrow(UnsupportedMediaTypeError);
  });

  it('тип проверяется раньше тела: чужой тип с битым текстом — всё равно 415', () => {
    expect(() => read('text/plain', Buffer.from('{'))).toThrow(UnsupportedMediaTypeError);
  });
});

describe('readReminderPatch: тело', () => {
  it.each([
    ['нет тела', undefined],
    ['пустой буфер', Buffer.alloc(0)],
    ['тело уже разобрано чужим парсером', JSON.parse(GOOD) as unknown],
    ['строка вместо буфера', GOOD],
  ])('%s — 400', (_name, body) => {
    expect(() => read('application/json', body)).toThrow(InvalidInputError);
  });

  it.each([
    ['синтаксис', '{"version":1,'],
    ['повтор ключа сверху', '{"version":1,"version":1,"changes":[]}'],
    [
      'повтор ключа в изменении',
      `{"version":1,"changes":[{"kind":"class","id":"${ID}","selected":true,"selected":false}]}`,
    ],
    [
      'повтор ключа через escape',
      `{"version":1,"changes":[{"kind":"class","id":"${ID}","selected":true,"\\u0073elected":false}]}`,
    ],
    ['BOM в начале', `\uFEFF${GOOD}`],
  ])('%s — 400 без текста тела в сообщении', (_name, text) => {
    try {
      read('application/json', Buffer.from(text));
      throw new Error('должно упасть');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidInputError);
      expect((err as Error).message).not.toContain(ID);
    }
  });

  it('текст не в UTF-8 — 400', () => {
    expect(() => read('application/json', Buffer.from([0x7b, 0xff, 0xfe, 0x7d]))).toThrow(
      InvalidInputError,
    );
  });

  it('верный JSON с неверной формой — ошибка проверки формы', () => {
    expect(() =>
      read('application/json', Buffer.from('{"version":2,"changes":[]}')),
    ).toThrow(InvalidInputError);
  });
});
