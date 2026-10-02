// Снимок кадра на подменённой библиотеке (loadLibrary) и на настоящем
// `<video>` из jsdom, которым управляет тест: WebCodecs и медиа-конвейера в
// jsdom нет, а проверять нужно нашу логику — какой кадр просим, когда сдаёмся
// без него, что освобождаем и как отменяем. Единственное приведение типа
// (`as unknown as`) в `makeLibrary` — настоящие классы закрыты приватными
// конструкторами, как в compressVideo.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureVideoPoster } from './captureVideoPoster';
import type { MediabunnyLibrary } from './compressVideo';
import { POSTER_TIMEOUT_MS } from './videoPosterPlan';

const BLOB = new Blob([new Uint8Array(8)], { type: 'video/mp4' });
// JPEG-байты [1, 2, 3] → такой base64.
const POSTER_BASE64 = 'AQID';

function jpegCanvas(bytes = [1, 2, 3]) {
  return {
    toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array(bytes)])),
  };
}

interface Scenario {
  track?: {
    width: number;
    height: number;
    first?: number;
    duration?: number | null;
  } | null;
  canDecode?: boolean;
  frame?: ReturnType<typeof jpegCanvas> | null;
  /** Кадр не приходит никогда — декодер завис. */
  hang?: boolean;
}

function makeLibrary(scenario: Scenario = {}) {
  const {
    track = { width: 1920, height: 1080, first: 0, duration: 10 },
    canDecode = true,
    frame = jpegCanvas(),
    hang = false,
  } = scenario;
  const record = {
    sinkOptions: undefined as unknown,
    timestamp: undefined as number | undefined,
    disposed: 0,
  };
  class Input {
    getPrimaryVideoTrack() {
      return Promise.resolve(
        track && {
          canDecode: () => Promise.resolve(canDecode),
          getDisplayWidth: () => Promise.resolve(track.width),
          getDisplayHeight: () => Promise.resolve(track.height),
          getFirstTimestamp: () => Promise.resolve(track.first ?? 0),
          getDurationFromMetadata: () => Promise.resolve(track.duration ?? null),
        },
      );
    }
    dispose() {
      record.disposed += 1;
    }
  }
  class CanvasSink {
    constructor(_track: unknown, options: unknown) {
      record.sinkOptions = options;
    }
    getCanvas(timestamp: number) {
      record.timestamp = timestamp;
      if (hang) return new Promise<never>(() => {});
      return Promise.resolve(frame && { canvas: frame, timestamp, duration: 0.03 });
    }
  }
  const lib = {
    Input,
    CanvasSink,
    BlobSource: class {},
    ALL_FORMATS: [],
  } as unknown as MediabunnyLibrary;
  return { lib, record };
}

function capture(
  scenario: Scenario | Error = {},
  options: { signal?: AbortSignal } = {},
) {
  const library = scenario instanceof Error ? undefined : makeLibrary(scenario);
  const loadLibrary = vi.fn(() =>
    library ? Promise.resolve(library.lib) : Promise.reject(scenario as Error),
  );
  return {
    run: captureVideoPoster(BLOB, { ...options, loadLibrary }),
    loadLibrary,
    record: library?.record,
  };
}

beforeEach(() => {
  vi.stubGlobal('VideoDecoder', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('captureVideoPoster — через Mediabunny', () => {
  it('кадр на 0,5 с, не больше 480 px по длинной стороне, JPEG в base64', async () => {
    const { run, record } = capture();

    expect(await run).toBe(POSTER_BASE64);
    expect(record?.sinkOptions).toEqual({ width: 480, height: 270, fit: 'fill' });
    expect(record?.timestamp).toBe(0.5);
    expect(record?.disposed).toBe(1);
  });

  it('отсчёт идёт от первой метки дорожки, а клип короче секунды — середина', async () => {
    const shifted = capture({
      track: { width: 640, height: 480, first: 2, duration: 0.4 },
    });

    await shifted.run;

    expect(shifted.record?.timestamp).toBeCloseTo(2.2);
    expect(shifted.record?.sinkOptions).toEqual({ width: 480, height: 360, fit: 'fill' });
  });

  it.each([
    ['дорожки нет', { track: null }],
    ['кодек не декодируется', { canDecode: false }],
    ['размеры кадра не прочитались', { track: { width: 0, height: 0 } }],
    ['кадра на этой секунде нет', { frame: null }],
  ] satisfies [string, Scenario][])(
    '%s — кадра нет, ошибки нет',
    async (_name, scenario) => {
      const { run } = capture(scenario);

      expect(await run).toBeNull();
    },
  );

  it('кусок с библиотекой не загрузился — кадра нет, ошибки нет', async () => {
    const { run } = capture(new Error('Failed to fetch dynamically imported module'));

    expect(await run).toBeNull();
  });

  it('кадр больше потолка на обоих качествах — кадра нет', async () => {
    const { run } = capture({ frame: jpegCanvas(new Array<number>(200 * 1024).fill(1)) });

    expect(await run).toBeNull();
  });

  it('в браузере нет VideoDecoder — библиотеку даже не грузим', async () => {
    vi.unstubAllGlobals();
    const { run, loadLibrary } = capture();

    expect(await run).toBeNull();
    expect(loadLibrary).not.toHaveBeenCalled();
  });
});

describe('captureVideoPoster — настоящая библиотека', () => {
  it('ленивый кусок грузится, а байты, которые не видео, дают null без ошибки', async () => {
    expect(await captureVideoPoster(BLOB)).toBeNull();
  });
});

describe('captureVideoPoster — срок и отмена', () => {
  it('декодер завис — через POSTER_TIMEOUT_MS кадра нет, загрузка не ждёт дольше', async () => {
    vi.useFakeTimers();
    const { run } = capture({ hang: true });
    let settled = false;
    void run.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(POSTER_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await run).toBeNull();
  });

  it('загрузку отменили — снимок бросается сразу', async () => {
    const controller = new AbortController();
    const { run } = capture({ hang: true }, { signal: controller.signal });

    controller.abort();

    expect(await run).toBeNull();
  });

  it('уже отменённый сигнал — кадра нет', async () => {
    const controller = new AbortController();
    controller.abort();
    const { run } = capture({}, { signal: controller.signal });

    expect(await run).toBeNull();
  });
});

// Запасной путь: настоящий элемент из jsdom, события шлёт тест.
describe('captureVideoPoster — запасной путь через <video>', () => {
  let created: HTMLVideoElement | undefined;
  const drawImage = vi.fn();
  const revokeObjectURL = vi.fn();
  const load = vi.fn();

  beforeEach(() => {
    vi.unstubAllGlobals(); // без VideoDecoder библиотека не нужна
    created = undefined;
    drawImage.mockClear();
    revokeObjectURL.mockClear();
    load.mockClear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:poster',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as RenderingContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob([new Uint8Array([1, 2, 3])])),
    );
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string, options?: ElementCreationOptions) => {
        const element = realCreate(tag, options);
        if (element instanceof HTMLVideoElement) created = element;
        return element;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  async function startedVideo(): Promise<HTMLVideoElement> {
    return vi.waitFor(() => {
      if (!created) throw new Error('видео ещё не создано');
      return created;
    });
  }

  function describeVideo(video: HTMLVideoElement): void {
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 720 });
    Object.defineProperty(video, 'duration', { value: 10 });
  }

  it('кадр с 0,5 с рисуется на холст 480×270, адрес объекта освобождён', async () => {
    const run = captureVideoPoster(BLOB);
    const video = await startedVideo();
    describeVideo(video);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);

    video.dispatchEvent(new Event('loadeddata'));
    await vi.waitFor(() => expect(video.currentTime).toBe(0.5));
    video.dispatchEvent(new Event('seeked'));

    expect(await run).toBe(POSTER_BASE64);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 480, 270);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster');
    expect(load).toHaveBeenCalled();
  });

  it('браузер не открыл видео (error) — кадра нет, адрес освобождён', async () => {
    const run = captureVideoPoster(BLOB);
    const video = await startedVideo();

    video.dispatchEvent(new Event('error'));

    expect(await run).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster');
  });

  it('seeked не пришёл (iOS без жеста) — по сроку кадра нет, адрес освобождён', async () => {
    vi.useFakeTimers();
    const run = captureVideoPoster(BLOB);
    const video = await startedVideo();
    describeVideo(video);
    video.dispatchEvent(new Event('loadeddata'));

    await vi.advanceTimersByTimeAsync(POSTER_TIMEOUT_MS);

    expect(await run).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster');
  });

  it('загрузку отменили до снимка — кадра нет, адрес объекта освобождён', async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await captureVideoPoster(BLOB, { signal: controller.signal })).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:poster');
  });

  it('размер кадра не прочитался — кадра нет', async () => {
    const run = captureVideoPoster(BLOB);
    const video = await startedVideo();
    video.dispatchEvent(new Event('loadeddata'));
    await vi.waitFor(() => expect(video.currentTime).toBe(0.5));
    video.dispatchEvent(new Event('seeked'));

    expect(await run).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('нет 2D-контекста — кадра нет', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const run = captureVideoPoster(BLOB);
    const video = await startedVideo();
    describeVideo(video);
    video.dispatchEvent(new Event('loadeddata'));
    await vi.waitFor(() => expect(video.currentTime).toBe(0.5));
    video.dispatchEvent(new Event('seeked'));

    expect(await run).toBeNull();
  });
});

describe('captureVideoPoster — нечем снимать', () => {
  it('нет ни VideoDecoder, ни URL.createObjectURL (jsdom) — сразу null, без ожидания срока', async () => {
    vi.unstubAllGlobals();

    expect(await captureVideoPoster(BLOB)).toBeNull();
  });
});
