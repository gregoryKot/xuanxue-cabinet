// fetch подменяется на globalThis — сеть не трогаем (CLAUDE.md «Тесты»), тот
// же приём, что у mail.service.spec.ts. Главное здесь: без ключей R2 сервис
// говорит «выключено» и ни одного запроса не делает (ADR-0057).
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { NotAvailableError } from '../common/errors';
import { FileStoreService } from './file-store.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function response(ok: boolean, status = 200): Response {
  return { ok, status } as Response;
}

const CONFIGURED = {
  R2_ACCOUNT_ID: 'abc123abc123abc123abc123abc123ab',
  R2_ACCESS_KEY_ID: 'R2ACCESSKEYEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'r2secretkeyexample0000000000000000000000',
  R2_BUCKET: 'school-files',
};
const KEY = 'materials/64b8f0a1c2d3e4f5a6b7c8d9/3f1a4c9e-5b2d-4f7a-8c1e-9d0b2a3f4c5d';
const NOW = DateTime.fromISO('2026-09-20T10:15:00Z', { zone: 'utc' });
const OBJECT_URL = `https://${CONFIGURED.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/school-files/${KEY}`;

describe('FileStoreService без ключей R2', () => {
  afterEach(() => jest.restoreAllMocks());

  const service = (): FileStoreService => new FileStoreService(fakeConfig({}));

  it('isEnabled === false', () => {
    expect(service().isEnabled).toBe(false);
  });

  it('put не ходит в сеть и бросает NotAvailableError', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await expect(
      service().put({
        key: KEY,
        bytes: Buffer.from('x'),
        contentType: 'application/pdf',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signedGetUrl бросает NotAvailableError, а не отдаёт неподписанный адрес', () => {
    expect(() => service().signedGetUrl(KEY, 600, NOW)).toThrow(NotAvailableError);
  });

  it.each([
    ['R2_ACCOUNT_ID'],
    ['R2_ACCESS_KEY_ID'],
    ['R2_SECRET_ACCESS_KEY'],
    ['R2_BUCKET'],
  ])('половина набора — тоже выключено (нет %s)', (missing) => {
    const values: Record<string, string | undefined> = { ...CONFIGURED };
    delete values[missing];
    expect(new FileStoreService(fakeConfig(values)).isEnabled).toBe(false);
  });
});

describe('FileStoreService с ключами R2', () => {
  afterEach(() => jest.restoreAllMocks());

  const service = (): FileStoreService => new FileStoreService(fakeConfig(CONFIGURED));

  it('isEnabled === true', () => {
    expect(service().isEnabled).toBe(true);
  });

  it('put шлёт PUT с телом, типом и подписью на адрес объекта', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(true));
    const bytes = Buffer.from('%PDF-1.4 методичка');

    await service().put({ key: KEY, bytes, contentType: 'application/pdf', now: NOW });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(OBJECT_URL);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(bytes);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/pdf');
    expect(headers['x-amz-date']).toBe('20260920T101500Z');
    expect(headers.authorization).toContain(
      `Credential=${CONFIGURED.R2_ACCESS_KEY_ID}/20260920/auto/s3/aws4_request`,
    );
  });

  it('remove шлёт DELETE без тела', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(true));

    await service().remove(KEY, NOW);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(OBJECT_URL);
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });

  it('ответ не 2xx — NotAvailableError, а не молчаливый успех', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(false, 403));
    await expect(service().remove(KEY, NOW)).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('сеть упала — NotAvailableError', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      service().put({
        key: KEY,
        bytes: Buffer.from('x'),
        contentType: 'application/pdf',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });

  // Без этого браузер сохранил бы файл под ключом объекта — `3f1a…` без
  // расширения (ADR-0057). Имя кириллицей живёт в заголовке только как
  // `filename*` по RFC 5987.
  it('signedGetUrl кладёт имя и тип файла в подписанные параметры ответа', () => {
    const url = new URL(
      service().signedGetUrl(KEY, 600, NOW, {
        name: 'Методичка.pdf',
        contentType: 'application/pdf',
      }),
    );

    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      "attachment; filename*=UTF-8''%D0%9C%D0%B5%D1%82%D0%BE%D0%B4%D0%B8%D1%87%D0%BA%D0%B0.pdf",
    );
    // Параметры входят в подпись — подменить имя в готовой ссылке нельзя.
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(service().signedGetUrl(KEY, 600, NOW)).searchParams.get('X-Amz-Signature'),
    );
  });

  it('signedGetUrl отдаёт адрес объекта со сроком жизни и подписью', () => {
    const url = new URL(service().signedGetUrl(KEY, 600, NOW));

    expect(`${url.origin}${url.pathname}`).toBe(OBJECT_URL);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260920T101500Z');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // Секрет в ссылку не попадает ни в каком виде.
    expect(url.search).not.toContain(CONFIGURED.R2_SECRET_ACCESS_KEY);
  });
});
