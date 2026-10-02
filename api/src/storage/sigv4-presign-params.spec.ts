// Параметры ответа в подписанной ссылке (`response-content-disposition`,
// ADR-0165): входят в канонический запрос, а значит и в подпись. Без этого
// имя и вид скачиваемого файла в готовой ссылке подменил бы кто угодно.
// Чистая подпись — без сети и без Mongo (CLAUDE.md «Тесты»); сам вывод подписи
// сверен с примером AWS в sigv4.spec.ts.
import { DateTime } from 'luxon';
import { presignGetUrl } from './sigv4';

const NOW = DateTime.fromISO('2026-10-02T09:00:00Z', { zone: 'utc' });
const OBJECT_URL = 'https://abc123.r2.cloudflarestorage.com/school-files/exam-videos/x';
const CREDENTIALS = {
  accessKeyId: 'R2ACCESSKEYEXAMPLE',
  secretAccessKey: 'r2secretkeyexample0000000000000000000000',
  region: 'auto',
  service: 's3',
};
const DISPOSITION = `attachment; filename*=UTF-8''video.mp4`;

function presign(params?: Record<string, string>): URL {
  return new URL(
    presignGetUrl({
      url: OBJECT_URL,
      params,
      expiresInSeconds: 3600,
      now: NOW,
      credentials: CREDENTIALS,
    }),
  );
}

describe('presignGetUrl — дополнительные параметры', () => {
  it('параметр попадает в query значением, а не пропадает', () => {
    const url = presign({ 'response-content-disposition': DISPOSITION });

    expect(url.searchParams.get('response-content-disposition')).toBe(DISPOSITION);
  });

  it('точка с запятой, звёздочка и апостроф закодированы по RFC 3986', () => {
    const query = presign({ 'response-content-disposition': DISPOSITION }).search;

    expect(query).toContain(
      'response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27video.mp4',
    );
  });

  it('канонический порядок — по имени: параметр ответа идёт после X-Amz-SignedHeaders, подпись в конце', () => {
    const names = [
      ...presign({ 'response-content-disposition': DISPOSITION }).searchParams.keys(),
    ];

    expect(names).toEqual([
      'X-Amz-Algorithm',
      'X-Amz-Credential',
      'X-Amz-Date',
      'X-Amz-Expires',
      'X-Amz-SignedHeaders',
      'response-content-disposition',
      'X-Amz-Signature',
    ]);
  });

  it('параметр меняет подпись, и другое значение — другую подпись', () => {
    const plain = presign().searchParams.get('X-Amz-Signature');
    const attachment = presign({ 'response-content-disposition': DISPOSITION });
    const renamed = presign({
      'response-content-disposition': `attachment; filename*=UTF-8''video.mov`,
    });

    expect(attachment.searchParams.get('X-Amz-Signature')).not.toBe(plain);
    expect(renamed.searchParams.get('X-Amz-Signature')).not.toBe(
      attachment.searchParams.get('X-Amz-Signature'),
    );
  });

  it('без параметров ссылка прежняя — просмотр не затронут', () => {
    expect(presign().toString()).toBe(presign({}).toString());
    expect(presign().searchParams.has('response-content-disposition')).toBe(false);
  });
});
