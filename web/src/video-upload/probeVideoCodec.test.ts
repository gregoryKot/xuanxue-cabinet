// Чтение кодека на подменённой библиотеке (loadLibrary), как captureVideoPoster.test.ts:
// WebCodecs в jsdom нет, проверяется наша логика — что читаем, что освобождаем и
// когда сдаёмся. Приведение типа (`as unknown as`) — в `makeLibrary`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediabunnyLibrary } from './compressVideo';
import { probeVideoCodec } from './probeVideoCodec';

const URL_SOURCE = '/api/exam-videos/a/bytes';
const TIMEOUT_MS = 30_000;

interface Scenario {
  /** `null` — в файле нет видеодорожки. */
  track?: { codec: string | null; canDecode?: boolean } | null;
  /** Заголовок не читается никогда — сеть молчит. */
  hang?: boolean;
  fail?: boolean;
}

function makeLibrary({
  track = { codec: 'hevc' },
  hang = false,
  fail = false,
}: Scenario) {
  const record = { disposed: 0, sources: [] as unknown[] };
  class Input {
    constructor(options: { source: unknown }) {
      record.sources.push(options.source);
    }
    getPrimaryVideoTrack() {
      if (hang) return new Promise<never>(() => {});
      if (fail) return Promise.reject(new Error('сеть оборвалась'));
      return Promise.resolve(
        track && {
          getCodec: () => Promise.resolve(track.codec),
          canDecode: () => Promise.resolve(track.canDecode ?? true),
        },
      );
    }
    dispose() {
      record.disposed += 1;
    }
  }
  const lib = {
    Input,
    BlobSource: class {
      kind = 'blob';
    },
    UrlSource: class {
      kind = 'url';
      constructor(
        public url: string,
        public options: unknown,
      ) {}
    },
    ALL_FORMATS: [],
  } as unknown as MediabunnyLibrary;
  return { lib, record };
}

function probe(scenario: Scenario | Error = {}, signal = new AbortController().signal) {
  const library = scenario instanceof Error ? undefined : makeLibrary(scenario);
  const loadLibrary = vi.fn(() =>
    library ? Promise.resolve(library.lib) : Promise.reject(scenario as Error),
  );
  const run = probeVideoCodec(URL_SOURCE, { signal, timeoutMs: TIMEOUT_MS, loadLibrary });
  return { run, loadLibrary, record: library?.record };
}

beforeEach(() => {
  vi.stubGlobal('VideoEncoder', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('probeVideoCodec — настоящая библиотека', () => {
  it('ленивый кусок грузится, а байты, которые не видео, дают «не прочитано» без ошибки', async () => {
    const notVideo = new Blob([new Uint8Array(64)]);

    const result = await probeVideoCodec(notVideo, {
      signal: new AbortController().signal,
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toEqual({ codec: null, canConvert: false });
  });
});

describe('probeVideoCodec', () => {
  it('читает кодек из адреса кусками, а не качает файл: источник — UrlSource', async () => {
    const { run, record } = probe({ track: { codec: 'hevc' } });

    expect(await run).toEqual({ codec: 'hevc', canConvert: true });
    expect(record?.sources[0]).toMatchObject({ kind: 'url', url: URL_SOURCE });
    expect(record?.disposed).toBe(1);
  });

  it('H.264 — кодек avc', async () => {
    const { run } = probe({ track: { codec: 'avc' } });

    expect(await run).toMatchObject({ codec: 'avc' });
  });

  it('браузер не декодирует этот кодек — перегонять здесь нечем', async () => {
    const { run } = probe({ track: { codec: 'hevc', canDecode: false } });

    expect(await run).toEqual({ codec: 'hevc', canConvert: false });
  });

  it('нет кодировщика (VideoEncoder) — перегонять нечем, кодек всё равно известен', async () => {
    vi.unstubAllGlobals();
    const { run } = probe({ track: { codec: 'hevc' } });

    expect(await run).toEqual({ codec: 'hevc', canConvert: false });
  });

  it.each(['prores', null])(
    'кодек %j вне списка сервера — null, но перегон возможен',
    async (codec) => {
      const { run } = probe({ track: { codec } });

      expect(await run).toEqual({ codec: null, canConvert: true });
    },
  );

  it('нет видеодорожки — не прочитано', async () => {
    const { run, record } = probe({ track: null });

    expect(await run).toEqual({ codec: null, canConvert: false });
    expect(record?.disposed).toBe(1);
  });

  it('чтение упало — не прочитано, не исключение', async () => {
    const { run, record } = probe({ fail: true });

    expect(await run).toEqual({ codec: null, canConvert: false });
    expect(record?.disposed).toBe(1);
  });

  it('кусок с библиотекой не загрузился — не прочитано', async () => {
    const { run } = probe(new Error('Failed to fetch dynamically imported module'));

    expect(await run).toEqual({ codec: null, canConvert: false });
  });

  it('сеть молчит дольше срока — не прочитано', async () => {
    vi.useFakeTimers();
    const { run } = probe({ hang: true });

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(await run).toEqual({ codec: null, canConvert: false });
  });

  it('отмена вызывающим обрывает чтение сразу', async () => {
    const controller = new AbortController();
    const { run } = probe({ hang: true }, controller.signal);

    controller.abort();

    expect(await run).toEqual({ codec: null, canConvert: false });
  });
});
