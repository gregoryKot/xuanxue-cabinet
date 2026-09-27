// fetch подменяется на globalThis (тот же приём, что file-store.service.spec.ts)
// — сеть не трогаем (CLAUDE.md «Тесты»).
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { NotAvailableError } from '../common/errors';
import { MultipartStoreService } from './multipart-store.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const CONFIGURED = {
  R2_ACCOUNT_ID: 'abc123abc123abc123abc123abc123ab',
  R2_ACCESS_KEY_ID: 'R2ACCESSKEYEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'r2secretkeyexample0000000000000000000000',
  R2_BUCKET: 'school-files',
};
const KEY = 'answer-videos/3f1a4c9e-5b2d-4f7a-8c1e-9d0b2a3f4c5d';
const NOW = DateTime.fromISO('2026-09-27T10:00:00Z', { zone: 'utc' });

function textResponse(
  ok: boolean,
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe('MultipartStoreService', () => {
  afterEach(() => jest.restoreAllMocks());

  const service = (): MultipartStoreService =>
    new MultipartStoreService(fakeConfig(CONFIGURED));

  it('isEnabled === false без ключей R2', () => {
    expect(new MultipartStoreService(fakeConfig({})).isEnabled).toBe(false);
  });

  it('createMultipartUpload разбирает UploadId из XML-ответа', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        textResponse(
          true,
          '<InitiateMultipartUploadResult><UploadId>abc-123</UploadId></InitiateMultipartUploadResult>',
        ),
      );

    const uploadId = await service().createMultipartUpload(KEY, 'video/mp4', NOW);

    expect(uploadId).toBe('abc-123');
  });

  it('createMultipartUpload без UploadId в ответе — NotAvailableError', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(true, '<Weird/>'));
    await expect(
      service().createMultipartUpload(KEY, 'video/mp4', NOW),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('uploadPart читает ETag из заголовка ответа', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(textResponse(true, '', 200, { etag: '"deadbeef"' }));

    const etag = await service().uploadPart({
      key: KEY,
      uploadId: 'abc-123',
      partNumber: 1,
      bytes: Buffer.from('часть файла'),
      now: NOW,
    });

    expect(etag).toBe('"deadbeef"');
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    const urlStr = url as string;
    expect(urlStr).toContain('partNumber=1');
    expect(urlStr).toContain('uploadId=abc-123');
    expect(init?.method).toBe('PUT');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('uploadPart без ETag в ответе — NotAvailableError', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(true, ''));
    await expect(
      service().uploadPart({
        key: KEY,
        uploadId: 'abc-123',
        partNumber: 1,
        bytes: Buffer.from('x'),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('uploadPart — сеть упала, NotAvailableError', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      service().uploadPart({
        key: KEY,
        uploadId: 'abc-123',
        partNumber: 1,
        bytes: Buffer.from('x'),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('completeMultipartUpload шлёт список частей и принимает успешный ответ', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(textResponse(true, '<CompleteMultipartUploadResult/>'));

    await service().completeMultipartUpload({
      key: KEY,
      uploadId: 'abc-123',
      parts: [
        { partNumber: 1, etag: '"a"' },
        { partNumber: 2, etag: '"b"' },
      ],
      now: NOW,
    });

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = (init?.body as Buffer).toString('utf8');
    expect(body).toContain('<PartNumber>1</PartNumber><ETag>"a"</ETag>');
    expect(body).toContain('<PartNumber>2</PartNumber><ETag>"b"</ETag>');
  });

  // ADR-0137: S3-совместимое хранилище может ответить 200 с <Error> в теле —
  // ошибка обнаруживается уже после начала отдачи ответа.
  it('completeMultipartUpload — 200 с <Error> в теле тоже отказ', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(textResponse(true, '<Error><Code>InvalidPart</Code></Error>'));

    await expect(
      service().completeMultipartUpload({
        key: KEY,
        uploadId: 'abc-123',
        parts: [],
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('abortMultipartUpload шлёт DELETE с uploadId в query', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(textResponse(true, ''));

    await service().abortMultipartUpload(KEY, 'abc-123', NOW);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url as string).toContain('uploadId=abc-123');
    expect(init?.method).toBe('DELETE');
  });

  it('без ключей R2 ни один метод не ходит в сеть', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const off = new MultipartStoreService(fakeConfig({}));
    await expect(off.createMultipartUpload(KEY, 'video/mp4', NOW)).rejects.toBeInstanceOf(
      NotAvailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
