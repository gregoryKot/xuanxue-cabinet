// Чистая подпись, без Mongo, без DI и без сети (CLAUDE.md «Тесты») — сверка
// с известными векторами, а не с собственным выводом: своя реализация SigV4
// (ADR-0057) держится только на том, что её результат совпадает с чужим.
//
// Якорь первого теста — пример «Signature Calculation for Presigned URL» из
// документации AWS: канонический запрос там опубликован целиком, и его SHA-256
// (3bfa2928…) напечатан в самом документе. Совпадение хеша значит, что мы
// собираем канонический запрос ровно так же, как AWS, — дальше расходиться
// подписи уже негде, кроме вывода ключа. Остальные векторы сняты с botocore
// (эталонная реализация AWS) для адресов формы R2.
import { DateTime } from 'luxon';
import { encodeRfc3986, sha256Hex } from './sigv4-canonical';
import { presignGetUrl, signRequestHeaders } from './sigv4';

// Тот же момент времени, что в примере AWS, — «Fri, 24 May 2013 00:00:00 GMT».
const NOW = DateTime.fromISO('2013-05-24T00:00:00Z', { zone: 'utc' });

const AWS_EXAMPLE_CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3',
};

// Значения такого же вида, как настоящие (R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY),
// но выдуманные: настоящие живут только в Railway (RUNBOOK §6.4).
const R2_CREDENTIALS = {
  accessKeyId: 'R2ACCESSKEYEXAMPLE',
  secretAccessKey: 'r2secretkeyexample0000000000000000000000',
  region: 'auto',
  service: 's3',
};
const R2_OBJECT_URL =
  'https://abc123.r2.cloudflarestorage.com/school-files/' +
  'materials/64b8f0a1c2d3e4f5a6b7c8d9/3f1a4c9e-5b2d-4f7a-8c1e-9d0b2a3f4c5d';

describe('encodeRfc3986', () => {
  // `encodeURIComponent` оставляет эти шесть как есть, а канонический запрос
  // SigV4 требует и их — без этого подпись расходится на именах с кавычкой
  // или скобкой.
  it("кодирует !'()* и звёздочку, которые encodeURIComponent пропускает", () => {
    expect(encodeRfc3986("!'()*")).toBe('%21%27%28%29%2A');
  });

  it('обычные символы не трогает', () => {
    expect(encodeRfc3986('file-name_1.pdf~')).toBe('file-name_1.pdf~');
  });
});

describe('presignGetUrl', () => {
  it('собирает канонический запрос так же, как пример AWS (хеш из документа)', () => {
    const canonicalRequest = [
      'GET',
      '/test.txt',
      'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2F' +
        'us-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&' +
        'X-Amz-SignedHeaders=host',
      'host:examplebucket.s3.amazonaws.com',
      '',
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    expect(sha256Hex(canonicalRequest)).toBe(
      '3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04',
    );
  });

  it('подписывает пример AWS целиком', () => {
    expect(
      presignGetUrl({
        url: 'https://examplebucket.s3.amazonaws.com/test.txt',
        expiresInSeconds: 86_400,
        now: NOW,
        credentials: AWS_EXAMPLE_CREDENTIALS,
      }),
    ).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=' +
        '3ed0be64024db54d5574a27da223529635c383f911f80e636f0ccc13890053d2',
    );
  });

  it('подписывает адрес объекта R2 (регион auto, срок в минутах)', () => {
    expect(
      presignGetUrl({
        url: R2_OBJECT_URL,
        expiresInSeconds: 600,
        now: NOW,
        credentials: R2_CREDENTIALS,
      }),
    ).toBe(
      `${R2_OBJECT_URL}?X-Amz-Algorithm=AWS4-HMAC-SHA256` +
        '&X-Amz-Credential=R2ACCESSKEYEXAMPLE%2F20130524%2Fauto%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=600&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=' +
        '623578daafaa39bd9ddfbadf1280c50e24269e850079a961708d72fbeb25b48c',
    );
  });

  it('срок жизни ссылки входит в подпись — другой срок даёт другую подпись', () => {
    const shorter = presignGetUrl({
      url: R2_OBJECT_URL,
      expiresInSeconds: 60,
      now: NOW,
      credentials: R2_CREDENTIALS,
    });
    const longer = presignGetUrl({
      url: R2_OBJECT_URL,
      expiresInSeconds: 600,
      now: NOW,
      credentials: R2_CREDENTIALS,
    });
    expect(shorter).not.toBe(longer);
  });

  // Пояс машины подпись не трогает: CI гоняет тесты и под TZ=Australia/Sydney
  // (CLAUDE.md «Время»), а дата в подписи всегда UTC.
  it('не зависит от пояса переданного момента', () => {
    const inSydney = NOW.setZone('Australia/Sydney');
    expect(
      presignGetUrl({
        url: R2_OBJECT_URL,
        expiresInSeconds: 600,
        now: inSydney,
        credentials: R2_CREDENTIALS,
      }),
    ).toBe(
      presignGetUrl({
        url: R2_OBJECT_URL,
        expiresInSeconds: 600,
        now: NOW,
        credentials: R2_CREDENTIALS,
      }),
    );
  });
});

describe('signRequestHeaders', () => {
  const body = Buffer.from('%PDF-1.4 hello');

  it('подписывает PUT с телом и типом содержимого', () => {
    expect(
      signRequestHeaders({
        method: 'PUT',
        url: R2_OBJECT_URL,
        headers: { 'content-type': 'application/pdf' },
        body,
        now: NOW,
        credentials: R2_CREDENTIALS,
      }),
    ).toEqual({
      'content-type': 'application/pdf',
      'x-amz-date': '20130524T000000Z',
      'x-amz-content-sha256':
        'f31cdee0b4d4fdae0638872f6bb7d0e6ee041386a9055d5e64c25d9d35dc88d1',
      authorization:
        'AWS4-HMAC-SHA256 Credential=R2ACCESSKEYEXAMPLE/20130524/auto/s3/aws4_request, ' +
        'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, ' +
        'Signature=c73cbe01f22275985cf79372d5f438864a32d89f098c01f4f7bdd92690ae9830',
    });
  });

  it('подписывает DELETE с пустым телом', () => {
    expect(
      signRequestHeaders({
        method: 'DELETE',
        url: R2_OBJECT_URL,
        headers: {},
        body: Buffer.alloc(0),
        now: NOW,
        credentials: R2_CREDENTIALS,
      }),
    ).toEqual({
      'x-amz-date': '20130524T000000Z',
      'x-amz-content-sha256':
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      authorization:
        'AWS4-HMAC-SHA256 Credential=R2ACCESSKEYEXAMPLE/20130524/auto/s3/aws4_request, ' +
        'SignedHeaders=host;x-amz-content-sha256;x-amz-date, ' +
        'Signature=d85c49217ae2ad63a75ca7aa35b6c67709975a068784cbe82a9af52288afa9db',
    });
  });

  // Канонический запрос сортирует заголовки сам — иначе подпись зависела бы
  // от порядка полей в объекте, который никто не обещает.
  it('порядок заголовков на входе не меняет подпись', () => {
    const sign = (headers: Record<string, string>): string =>
      signRequestHeaders({
        method: 'PUT',
        url: R2_OBJECT_URL,
        headers,
        body,
        now: NOW,
        credentials: R2_CREDENTIALS,
      }).authorization;
    expect(sign({ 'content-type': 'application/pdf', 'x-custom': 'a' })).toBe(
      sign({ 'x-custom': 'a', 'content-type': 'application/pdf' }),
    );
  });

  it('имя заголовка в верхнем регистре приводится к нижнему', () => {
    const upper = signRequestHeaders({
      method: 'PUT',
      url: R2_OBJECT_URL,
      headers: { 'Content-Type': 'application/pdf' },
      body,
      now: NOW,
      credentials: R2_CREDENTIALS,
    });
    expect(upper.authorization).toContain('SignedHeaders=content-type;host;');
  });

  it('подмена байта в теле меняет подпись — хеш тела входит в неё', () => {
    const sign = (payload: Buffer): string =>
      signRequestHeaders({
        method: 'PUT',
        url: R2_OBJECT_URL,
        headers: { 'content-type': 'application/pdf' },
        body: payload,
        now: NOW,
        credentials: R2_CREDENTIALS,
      }).authorization;
    expect(sign(body)).not.toBe(sign(Buffer.from('%PDF-1.4 hellp')));
  });
});
