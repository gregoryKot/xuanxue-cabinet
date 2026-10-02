// Базовый хендлер редиректа на видео (ADR-0133, ADR-0165) отдельно от обоих
// контроллеров: у них он общий до последней скобки. Роли и владение — e2e
// (video-download.e2e-spec.ts, exam-videos.e2e-spec.ts).
import { DateTime } from 'luxon';
import { VIEW_VIDEO, type VideoUrlOptions } from './video-link';
import { VideoRedirectController } from './video-redirect';

const URL_TO_R2 = 'https://fake-r2.example/video?X-Amz-Signature=ab';

class FakeVideoController extends VideoRedirectController<string> {
  readonly calls: { id: string; user: string; options: VideoUrlOptions }[] = [];

  protected signedUrl(
    id: string,
    user: string,
    _now: DateTime,
    options: VideoUrlOptions,
  ): Promise<string> {
    this.calls.push({ id, user, options });
    return Promise.resolve(URL_TO_R2);
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
    const controller = new FakeVideoController();
    const { res, headers, state } = fakeResponse();

    await controller.get('v1', {}, 'u1', res);

    expect(controller.calls).toEqual([{ id: 'v1', user: 'u1', options: VIEW_VIDEO }]);
    expect(headers['Location']).toBe(URL_TO_R2);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(state.status).toBe(302);
  });

  it('download=1 — сервису уходит скачивание, ответ тот же 302 no-store', async () => {
    const controller = new FakeVideoController();
    const { res, headers, state } = fakeResponse();

    await controller.get('v1', { download: '1' }, 'u1', res);

    expect(controller.calls).toEqual([
      { id: 'v1', user: 'u1', options: { download: true } },
    ]);
    expect(headers['Location']).toBe(URL_TO_R2);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(state.status).toBe(302);
  });

  it('отказ сервиса не превращается в редирект', async () => {
    class Denying extends FakeVideoController {
      protected override signedUrl(): Promise<string> {
        return Promise.reject(new Error('нет доступа'));
      }
    }
    const { res, headers } = fakeResponse();

    await expect(new Denying().get('v1', {}, 'u1', res)).rejects.toThrow('нет доступа');
    expect(headers['Location']).toBeUndefined();
  });
});
