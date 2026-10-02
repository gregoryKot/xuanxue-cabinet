// Маршруты видео вопроса для общего загрузчика (ADR-0165): каждый вызов
// транспорта уходит на свой маршрут карты с нужным телом, а целый прогон через
// настоящий транспорт и мок сети шлёт ровно те запросы, что и у видео-ответа.
// Ответы — по точному пути (три части одной загрузки отвечают по-разному),
// поэтому свой `mockImplementation`; `…Once` не используется
// (check-once-mock-ratchet.mjs).
import { describe, expect, it, vi } from 'vitest';
import type { ExamVideoDto, VideoUploadDto } from '@xuanxue/shared';
import { apiRoutePath } from '../api/apiRoute';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { runVideoUpload } from '../video-upload/videoUploadRunner';
import { examVideoTransport } from './examVideoTransport';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const START_PATH = apiRoutePath('POST /exam-videos/uploads');

function partPath(uploadId: string, partNumber: number): string {
  return apiRoutePath('PUT /exam-videos/:id/parts/:n', {
    params: { id: uploadId, n: String(partNumber) },
  });
}

function completePath(uploadId: string): string {
  return apiRoutePath('POST /exam-videos/:id/complete', { params: { id: uploadId } });
}

function dto(receivedParts: number[] = []): VideoUploadDto {
  return { id: 'u1', partBytes: 8, partCount: 3, receivedParts };
}

const VIDEO: ExamVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 20,
  createdAt: '2026-10-02T10:00:00.000Z',
};

describe('examVideoTransport — маршруты', () => {
  const signal = new AbortController().signal;
  const transport = examVideoTransport();

  it('start: POST /exam-videos/uploads с размером и отпечатком, без вопроса', async () => {
    mockedApiFetch.mockResolvedValue(dto());

    await transport.start({ sizeBytes: 20, fingerprint: '20:abc' }, { signal });

    expect(mockedApiFetch).toHaveBeenCalledWith(START_PATH, {
      method: 'POST',
      body: { sizeBytes: 20, fingerprint: '20:abc' },
      signal,
    });
  });

  it('uploadPart: PUT /exam-videos/:id/parts/:n сырым телом, со своим таймаутом', async () => {
    mockedApiFetch.mockResolvedValue(dto([2]));
    const body = new Blob([new Uint8Array(8)]);

    await transport.uploadPart('u1', 2, body, { signal, timeoutMs: 5000 });

    expect(mockedApiFetch).toHaveBeenCalledWith(partPath('u1', 2), {
      method: 'PUT',
      body,
      signal,
      timeoutMs: 5000,
    });
  });

  it('complete: POST /exam-videos/:id/complete с кадром-превью в теле', async () => {
    mockedApiFetch.mockResolvedValue(VIDEO);

    await expect(transport.complete('u1', 'QkFTRTY0', { signal })).resolves.toEqual(
      VIDEO,
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(completePath('u1'), {
      method: 'POST',
      body: { poster: 'QkFTRTY0' },
      signal,
    });
  });

  it('complete без кадра: в теле нет poster, видео завершается так же', async () => {
    mockedApiFetch.mockResolvedValue(VIDEO);

    await transport.complete('u1', undefined, { signal });

    const [, init] = mockedApiFetch.mock.calls[0] ?? [];
    expect(JSON.stringify(init?.body)).toBe('{}');
  });
});

describe('examVideoTransport — целый прогон загрузчика', () => {
  it('старт → части → complete: пять запросов, готовое видео в onDone', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(dto());
      if (path === partPath('u1', 1)) return Promise.resolve(dto([1]));
      if (path === partPath('u1', 2)) return Promise.resolve(dto([1, 2]));
      if (path === partPath('u1', 3)) return Promise.resolve(dto([1, 2, 3]));
      if (path === completePath('u1')) return Promise.resolve(VIDEO);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const onDone = vi.fn();

    await runVideoUpload({
      file: new File([new Uint8Array(20)], 'clip.mp4', { type: 'video/mp4' }),
      transport: examVideoTransport(),
      signal: new AbortController().signal,
      isCancelled: () => false,
      onProgress: vi.fn(),
      waitForResume: () => Promise.resolve(),
      onFailed: vi.fn(),
      onDone,
    });

    expect(mockedApiFetch.mock.calls.map(([path]) => path)).toEqual([
      START_PATH,
      partPath('u1', 1),
      partPath('u1', 2),
      partPath('u1', 3),
      completePath('u1'),
    ]);
    expect(onDone).toHaveBeenCalledWith(VIDEO);
  });
});
