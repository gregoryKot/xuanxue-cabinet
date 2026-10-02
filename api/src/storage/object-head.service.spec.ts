// fetch подменяется на globalThis (тот же приём, что multipart-store.service.spec.ts)
// — сеть не трогаем (CLAUDE.md «Тесты»).
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { NotAvailableError } from '../common/errors';
import { ObjectHeadService } from './object-head.service';

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
const NOW = DateTime.fromISO('2026-10-02T10:00:00Z', { zone: 'utc' });

function headResponse(status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe('ObjectHeadService.sizeBytes', () => {
  afterEach(() => jest.restoreAllMocks());

  const service = (): ObjectHeadService => new ObjectHeadService(fakeConfig(CONFIGURED));

  it('шлёт подписанный HEAD по адресу объекта и отдаёт Content-Length', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(headResponse(200, { 'content-length': '20971520' }));

    const size = await service().sizeBytes(KEY, NOW);

    expect(size).toBe(20_971_520);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(
      `https://${CONFIGURED.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/school-files/${KEY}`,
    );
    expect(init?.method).toBe('HEAD');
    expect((init?.headers as Record<string, string>).authorization).toContain(
      'AWS4-HMAC-SHA256',
    );
  });

  it('404 — объекта нет, null', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(headResponse(404));
    await expect(service().sizeBytes(KEY, NOW)).resolves.toBeNull();
  });

  it('хранилище не назвало размер — null, а не ноль', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(headResponse(200));
    await expect(service().sizeBytes(KEY, NOW)).resolves.toBeNull();
  });

  it('500 — NotAvailableError: «не знаем» не выдаётся за «нет»', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(headResponse(500));
    await expect(service().sizeBytes(KEY, NOW)).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('сеть упала — NotAvailableError', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(service().sizeBytes(KEY, NOW)).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('без ключей R2 не ходит в сеть', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const off = new ObjectHeadService(fakeConfig({}));
    await expect(off.sizeBytes(KEY, NOW)).rejects.toBeInstanceOf(NotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
