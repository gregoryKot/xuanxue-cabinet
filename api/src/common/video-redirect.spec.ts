// Базовый хендлер редиректа на видео и кадр-превью (ADR-0133, ADR-0165) отдельно
// от обоих контроллеров: у них он общий до последней скобки. Роли и владение —
// e2e (video-download.e2e-spec.ts, exam-videos.e2e-spec.ts, *-poster.e2e-spec.ts).
import { StreamableFile } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { VIDEO_POSTER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { NotFoundError } from './errors';
import { VIEW_VIDEO, type VideoUrlOptions } from './video-link';
import { VideoRedirectController, type VideoAccess } from './video-redirect';

const URL_TO_R2 = 'https://fake-r2.example/video?X-Amz-Signature=ab';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** Сервис видео своего вида: записывает вызовы, отвечает заданным. */
class FakeVideoAccess implements VideoAccess<string> {
  readonly calls: { id: string; user: string; options: VideoUrlOptions }[] = [];
  poster: Buffer | null = JPEG;
  failure: Error | undefined;

  signedUrl(
    id: string,
    user: string,
    _now: DateTime,
    options: VideoUrlOptions,
  ): Promise<string> {
    if (this.failure) return Promise.reject(this.failure);
    this.calls.push({ id, user, options });
    return Promise.resolve(URL_TO_R2);
  }

  loadPoster(): Promise<Buffer | null> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve(this.poster);
  }
}

class FakeVideoController extends VideoRedirectController<string> {
  constructor(access: FakeVideoAccess) {
    super(access);
  }
}

function fakeResponse() {
  const headers: Record<string, string> = {};
  const state: { status?: number } = {};
  const res = {
    setHeader: (name: string, value: string) => (headers[name] = value),
    status: (code: number) => {
      state.status = code;
    },
  };
  return { res, headers, state };
}

describe('VideoRedirectController.get', () => {
  it('без параметра — просмотр: сервису уходит VIEW_VIDEO, ответ 302 no-store', async () => {
    const access = new FakeVideoAccess();
    const { res, headers, state } = fakeResponse();

    await new FakeVideoController(access).get('v1', {}, 'u1', res);

    expect(access.calls).toEqual([{ id: 'v1', user: 'u1', options: VIEW_VIDEO }]);
    expect(headers['Location']).toBe(URL_TO_R2);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(state.status).toBe(302);
  });

  it('download=1 — сервису уходит скачивание, ответ тот же 302 no-store', async () => {
    const access = new FakeVideoAccess();
    const { res, headers, state } = fakeResponse();

    await new FakeVideoController(access).get('v1', { download: '1' }, 'u1', res);

    expect(access.calls).toEqual([{ id: 'v1', user: 'u1', options: { download: true } }]);
    expect(headers['Location']).toBe(URL_TO_R2);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(state.status).toBe(302);
  });

  it('отказ сервиса не превращается в редирект', async () => {
    const access = new FakeVideoAccess();
    access.failure = new Error('нет доступа');
    const { res, headers } = fakeResponse();

    await expect(
      new FakeVideoController(access).get('v1', {}, 'u1', res),
    ).rejects.toThrow('нет доступа');
    expect(headers['Location']).toBeUndefined();
  });
});

// ADR-0165: кадр-превью отдаёт тот же базовый хендлер, что и редирект на видео.
describe('VideoRedirectController.poster', () => {
  it('кадр есть — байты как image/jpeg и кеш на сутки только для этого человека', async () => {
    const { res, headers } = fakeResponse();

    const file = await new FakeVideoController(new FakeVideoAccess()).poster(
      'v1',
      'u1',
      res,
    );

    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders().type).toBe('image/jpeg');
    expect(headers['Cache-Control']).toBe('private, max-age=86400');
  });

  it('кадра нет — 404 в общем конверте, без заголовка кеша', async () => {
    const access = new FakeVideoAccess();
    access.poster = null;
    const { res, headers } = fakeResponse();

    const failure = new FakeVideoController(access).poster('v1', 'u1', res);

    await expect(failure).rejects.toBeInstanceOf(NotFoundError);
    await expect(failure).rejects.toThrow(VIDEO_POSTER_NOT_FOUND_MESSAGE);
    expect(headers['Cache-Control']).toBeUndefined();
  });

  it('отказ сервиса (чужое или не готовое видео) уходит как есть, кадр не отдаётся', async () => {
    const access = new FakeVideoAccess();
    access.failure = new NotFoundError('видео не найдено');
    const { res, headers } = fakeResponse();

    await expect(new FakeVideoController(access).poster('v1', 'u1', res)).rejects.toThrow(
      'видео не найдено',
    );
    expect(headers['Cache-Control']).toBeUndefined();
  });
});
