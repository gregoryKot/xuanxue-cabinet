// Маршруты видео-ответа ученика для общего загрузчика (ADR-0137, ADR-0165):
// каждый вызов транспорта уходит на свой маршрут карты с нужным телом, а
// целый прогон через настоящий транспорт и мок сети шлёт ровно те запросы,
// что слал загрузчик ответа до выноса в video-upload/. Ответы — по точному
// пути (три части одной загрузки отвечают по-разному), поэтому свой
// `mockImplementation`, а не `mockApiByPath`; `…Once` не используется
// (check-once-mock-ratchet.mjs).
import { describe, expect, it, vi } from 'vitest';
import type { AnswerVideoUploadDto, ExamMediaDto } from '@xuanxue/shared';
import { apiRoutePath } from '../api/apiRoute';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { runVideoUpload } from '../video-upload/videoUploadRunner';
import { answerVideoTransport } from './answerVideoTransport';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const ATTEMPT_ID = 'a1';
const ITEM_ID = 'q1';
const START_PATH = apiRoutePath('POST /attempts/:id/answer-video', {
  params: { id: ATTEMPT_ID },
});

function partPath(uploadId: string, partNumber: number): string {
  return apiRoutePath('PUT /answer-videos/:id/parts/:n', {
    params: { id: uploadId, n: String(partNumber) },
  });
}

function completePath(uploadId: string): string {
  return apiRoutePath('POST /answer-videos/:id/complete', { params: { id: uploadId } });
}

function dto(receivedParts: number[] = []): AnswerVideoUploadDto {
  return { id: 'u1', partBytes: 8, partCount: 3, receivedParts };
}

const MEDIA: ExamMediaDto = {
  id: 'm1',
  attemptId: ATTEMPT_ID,
  itemId: ITEM_ID,
  kind: 'file',
  answerVideoId: 'u1',
  receivedAt: '2026-09-27T10:00:00Z',
};

function answerWholeUpload(): void {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === START_PATH) return Promise.resolve(dto());
    if (path === partPath('u1', 1)) return Promise.resolve(dto([1]));
    if (path === partPath('u1', 2)) return Promise.resolve(dto([1, 2]));
    if (path === partPath('u1', 3)) return Promise.resolve(dto([1, 2, 3]));
    if (path === completePath('u1')) return Promise.resolve(MEDIA);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

function runOnFile(file: File): Promise<void> {
  return runVideoUpload({
    file,
    transport: answerVideoTransport(ATTEMPT_ID, ITEM_ID),
    signal: new AbortController().signal,
    isCancelled: () => false,
    onProgress: vi.fn(),
    waitForResume: () => Promise.resolve(),
    onFailed: vi.fn(),
    onDone: vi.fn(),
  });
}

describe('answerVideoTransport — маршруты', () => {
  const signal = new AbortController().signal;
  const transport = answerVideoTransport(ATTEMPT_ID, ITEM_ID);

  it('start: POST /attempts/:id/answer-video с вопросом, размером и отпечатком', async () => {
    mockedApiFetch.mockResolvedValue(dto());

    await transport.start({ sizeBytes: 20, fingerprint: '20:abc' }, { signal });

    expect(mockedApiFetch).toHaveBeenCalledWith(START_PATH, {
      method: 'POST',
      body: { itemId: ITEM_ID, sizeBytes: 20, fingerprint: '20:abc' },
      signal,
    });
  });

  it('uploadPart: PUT /answer-videos/:id/parts/:n сырым телом, со своим таймаутом', async () => {
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

  it('complete: POST /answer-videos/:id/complete с кадром-превью в теле', async () => {
    mockedApiFetch.mockResolvedValue(MEDIA);

    await expect(transport.complete('u1', 'QkFTRTY0', { signal })).resolves.toEqual(
      MEDIA,
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(completePath('u1'), {
      method: 'POST',
      body: { poster: 'QkFTRTY0' },
      signal,
    });
  });

  it('complete без кадра: в теле нет poster, видео завершается так же', async () => {
    mockedApiFetch.mockResolvedValue(MEDIA);

    await transport.complete('u1', undefined, { signal });

    const [, init] = mockedApiFetch.mock.calls[0] ?? [];
    expect(JSON.stringify(init?.body)).toBe('{}');
  });
});

describe('answerVideoTransport — целый прогон загрузчика', () => {
  it('старт → части → complete: те же пять запросов, что слал загрузчик ответа', async () => {
    answerWholeUpload();

    await runOnFile(new File([new Uint8Array(20)], 'form.mp4', { type: 'video/mp4' }));

    expect(mockedApiFetch.mock.calls.map(([path]) => path)).toEqual([
      START_PATH,
      partPath('u1', 1),
      partPath('u1', 2),
      partPath('u1', 3),
      completePath('u1'),
    ]);
  });

  it('в старт уходит отпечаток по содержимому: «размер:SHA-256», не «размер:дата» (F18)', async () => {
    answerWholeUpload();
    const bytes = new Uint8Array(20).fill(7);
    const exported = (lastModified: number) =>
      new File([bytes], 'IMG.MOV', { type: 'video/quicktime', lastModified });

    await runOnFile(exported(1));
    await runOnFile(exported(2)); // iPhone: «Фото» отдаёт тот же ролик с новой датой

    const [first, second] = mockedApiFetch.mock.calls
      .filter(([path]) => path === START_PATH)
      .map(([, init]) => init?.body);
    expect(first).toEqual({
      itemId: ITEM_ID,
      sizeBytes: 20,
      fingerprint: expect.stringMatching(/^20:[0-9a-f]{64}$/) as string,
    });
    expect(second).toEqual(first);
  });
});
