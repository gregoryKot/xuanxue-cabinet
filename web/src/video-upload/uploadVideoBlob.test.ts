// Загрузка файла частями как обещание (uploadVideoBlob.ts): тот же прогон, что у
// формы, на фейковом транспорте (test-support/fakeVideoTransport.ts), сети нет.
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import {
  FAKE_UPLOAD_RESULT,
  makeFakeTransport,
} from '../test-support/fakeVideoTransport';
import { uploadVideoBlob } from './uploadVideoBlob';

function makeFile(bytes = 20): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'video/mp4' });
}

function upload(
  overrides: Partial<Parameters<typeof uploadVideoBlob<{ id: string }>>[0]> = {},
) {
  return uploadVideoBlob({
    file: makeFile(),
    transport: makeFakeTransport(),
    signal: new AbortController().signal,
    waitForResume: () => Promise.resolve(),
    ...overrides,
  });
}

describe('uploadVideoBlob', () => {
  it('старт → части → complete: отвечает готовым видео', async () => {
    const transport = makeFakeTransport();

    await expect(upload({ transport })).resolves.toEqual(FAKE_UPLOAD_RESULT);

    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(transport.uploadPart).toHaveBeenCalledTimes(3);
    expect(transport.complete).toHaveBeenCalledTimes(1);
  });

  it('кодек файла уходит в complete', async () => {
    const transport = makeFakeTransport();

    await upload({ transport, codec: 'avc' });

    expect(transport.complete.mock.calls[0]?.[1]).toMatchObject({ codec: 'avc' });
  });

  it('сбой сети на части — пауза и повтор, видео всё равно доезжает', async () => {
    let attempts = 0;
    const transport = makeFakeTransport({
      uploadPart: (_id, partNumber) => {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new ApiError('Нет связи.', 0, 'network'));
        }
        return Promise.resolve({
          id: 'u1',
          partBytes: 8,
          partCount: 3,
          receivedParts: Array.from({ length: partNumber }, (_, i) => i + 1),
        });
      },
    });
    const waitForResume = vi.fn(() => Promise.resolve());

    await expect(upload({ transport, waitForResume })).resolves.toEqual(
      FAKE_UPLOAD_RESULT,
    );

    expect(waitForResume).toHaveBeenCalledTimes(1);
  });

  it('сервер отказал (4xx) — отказ с текстом сервера, complete не зовётся', async () => {
    const transport = makeFakeTransport({
      start: () =>
        Promise.reject(new ApiError('Видео больше 50 МБ.', 413, 'payload_too_large')),
    });

    await expect(upload({ transport })).rejects.toThrow('Видео больше 50 МБ.');

    expect(transport.complete).not.toHaveBeenCalled();
  });

  it('отмена посреди загрузки отвергает промис как отмену, а не оставляет висеть', async () => {
    const controller = new AbortController();
    const transport = makeFakeTransport({
      uploadPart: () => {
        controller.abort();
        return Promise.reject(new ApiError('Нет связи.', 0, 'network'));
      },
    });

    await expect(upload({ transport, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(transport.complete).not.toHaveBeenCalled();
  });

  it('уже отменённый сигнал — в сеть не ходит', async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = makeFakeTransport();

    await expect(upload({ transport, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(transport.start).not.toHaveBeenCalled();
  });
});
