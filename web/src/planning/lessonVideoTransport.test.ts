// Маршруты записи занятия для общего загрузчика (ADR-0180): каждый вызов
// транспорта уходит на свой маршрут карты с нужным телом. Образец —
// attempt/answerVideoTransport.test.ts; `…Once` не используется
// (check-once-mock-ratchet.mjs).
import { describe, expect, it, vi } from 'vitest';
import type { LessonVideoDto, VideoUploadDto } from '@xuanxue/shared';
import { apiRoutePath } from '../api/apiRoute';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { lessonVideoTransport } from './lessonVideoTransport';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const SESSION: VideoUploadDto = {
  id: 'u1',
  partBytes: 8,
  partCount: 3,
  receivedParts: [],
};
const VIDEO: LessonVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 20,
  createdAt: '2026-10-10T10:00:00Z',
};

describe('lessonVideoTransport — маршруты', () => {
  const signal = new AbortController().signal;
  const transport = lessonVideoTransport();

  it('start: POST /lesson-videos/uploads с размером и отпечатком, без вопроса', async () => {
    mockedApiFetch.mockResolvedValue(SESSION);

    await transport.start({ sizeBytes: 20, fingerprint: '20:abc' }, { signal });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      apiRoutePath('POST /lesson-videos/uploads'),
      { method: 'POST', body: { sizeBytes: 20, fingerprint: '20:abc' }, signal },
    );
  });

  it('uploadPart: PUT /lesson-videos/:id/parts/:n сырым телом, со своим таймаутом', async () => {
    mockedApiFetch.mockResolvedValue({ ...SESSION, receivedParts: [2] });
    const body = new Blob([new Uint8Array(8)]);

    await transport.uploadPart('u1', 2, body, { signal, timeoutMs: 5000 });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      apiRoutePath('PUT /lesson-videos/:id/parts/:n', { params: { id: 'u1', n: '2' } }),
      { method: 'PUT', body, signal, timeoutMs: 5000 },
    );
  });

  it('complete: POST /lesson-videos/:id/complete с кадром-превью, ответ — видео', async () => {
    mockedApiFetch.mockResolvedValue(VIDEO);

    await expect(transport.complete('u1', 'QkFTRTY0', { signal })).resolves.toEqual(
      VIDEO,
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      apiRoutePath('POST /lesson-videos/:id/complete', { params: { id: 'u1' } }),
      { method: 'POST', body: { poster: 'QkFTRTY0' }, signal },
    );
  });
});
