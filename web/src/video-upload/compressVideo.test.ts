// Сжатие на подменённой библиотеке (loadLibrary): настоящего WebCodecs в jsdom
// нет, да и проверять нужно нашу логику — что просим у библиотеки, когда
// отдаём исходник и как отменяем, а не сам кодек. Фейковая библиотека — один
// объект с теми же классами, что у Mediabunny; единственное приведение типа
// (`as unknown as`) в `makeLibrary`, потому что настоящие классы закрыты
// приватными конструкторами.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canCompressVideo, compressVideo, type MediabunnyLibrary } from './compressVideo';
import { TARGET_VIDEO_BITRATE } from './videoCompressionPlan';

const MIB = 1024 * 1024;
const SOURCE_BYTES = 9 * MIB;

interface Scenario {
  track?: { width: number; height: number; frameRate: number } | null;
  isValid?: boolean;
  discardedTracks?: unknown[];
  /** `null` — библиотека закончила, но буфер так и не отдала. */
  outputBytes?: number | null;
  /** `fail` — execute падает, `hang` — висит, пока не придёт cancel. */
  execute?: 'ok' | 'fail' | 'hang';
  progress?: number[];
}

type InitOptions = {
  video: Record<string, unknown>;
  audio?: unknown;
  output: { options: { target: { buffer: ArrayBuffer | null } } };
};

function makeLibrary(scenario: Scenario = {}) {
  const {
    track = { width: 1920, height: 1080, frameRate: 30 },
    isValid = true,
    discardedTracks = [],
    outputBytes = 2 * MIB,
    execute = 'ok',
    progress = [],
  } = scenario;
  const record = {
    initOptions: undefined as InitOptions | undefined,
    mp4Options: undefined as unknown,
    qualityOptions: undefined as unknown,
    disposed: 0,
    cancel: vi.fn(),
    execute: vi.fn(),
  };

  class Input {
    constructor(readonly options: unknown) {}
    getPrimaryVideoTrack() {
      return Promise.resolve(
        track && {
          getDisplayWidth: () => Promise.resolve(track.width),
          getDisplayHeight: () => Promise.resolve(track.height),
          computePacketStats: () =>
            Promise.resolve({ averagePacketRate: track.frameRate }),
        },
      );
    }
    dispose() {
      record.disposed += 1;
    }
  }
  class Output {
    constructor(readonly options: { target: { buffer: ArrayBuffer | null } }) {}
  }
  class Conversion {
    isValid = isValid;
    discardedTracks = discardedTracks;
    onProgress?: (fraction: number) => void;
    private fail?: (error: Error) => void;
    constructor(private readonly options: InitOptions) {}
    static init(options: InitOptions) {
      record.initOptions = options;
      return Promise.resolve(new Conversion(options));
    }
    cancel() {
      record.cancel();
      this.fail?.(new Error('canceled'));
      return Promise.resolve();
    }
    execute() {
      record.execute();
      progress.forEach((fraction) => this.onProgress?.(fraction));
      if (execute === 'fail') return Promise.reject(new Error('кодек отказал'));
      if (execute === 'hang') {
        return new Promise<void>((_resolve, reject) => {
          this.fail = reject;
        });
      }
      if (outputBytes !== null) {
        this.options.output.options.target.buffer = new ArrayBuffer(outputBytes);
      }
      return Promise.resolve();
    }
  }
  const lib = {
    Input,
    Output,
    Conversion,
    BlobSource: class {
      constructor(readonly blob: Blob) {}
    },
    BufferTarget: class {
      buffer: ArrayBuffer | null = null;
    },
    Mp4OutputFormat: class {
      constructor(options: unknown) {
        record.mp4Options = options;
      }
    },
    Quality: class {
      constructor(options: unknown) {
        record.qualityOptions = options;
      }
    },
    ALL_FORMATS: [],
  } as unknown as MediabunnyLibrary;
  return { lib, record };
}

function makeFile(size = SOURCE_BYTES): File {
  const file = new File([new Uint8Array(1)], 'form.mov', { type: 'video/quicktime' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function compress(
  file: File,
  scenario: Scenario | Error = {},
  overrides: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
) {
  const library = scenario instanceof Error ? undefined : makeLibrary(scenario);
  const loadLibrary = vi.fn(() =>
    library ? Promise.resolve(library.lib) : Promise.reject(scenario as Error),
  );
  const run = compressVideo(file, {
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    ...overrides,
    loadLibrary,
  });
  return { run, loadLibrary, record: library?.record };
}

beforeEach(() => {
  vi.stubGlobal('VideoEncoder', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compressVideo — получилось', () => {
  it('отдаёт MP4 меньшего размера и просит у библиотеки H.264 720p около 2 Мбит/с', async () => {
    const { run, record } = compress(makeFile());

    const result = await run;

    expect(result.type).toBe('video/mp4');
    expect(result.size).toBe(2 * MIB);
    expect(record?.initOptions?.video).toMatchObject({
      codec: 'avc',
      width: 1280,
      height: 720,
    });
    expect(record?.qualityOptions).toEqual({ bitrate: TARGET_VIDEO_BITRATE });
  });

  it('индекс MP4 в начале файла, звук не трогаем, исходник освобождён', async () => {
    const { run, record } = compress(makeFile());

    await run;

    expect(record?.mp4Options).toEqual({ fastStart: 'in-memory' });
    expect(record?.initOptions).not.toHaveProperty('audio');
    expect(record?.disposed).toBe(1);
  });

  it('60 кадров/с режется до 30, у 30 частоту не задаём', async () => {
    const fast = compress(makeFile(), {
      track: { width: 1920, height: 1080, frameRate: 60 },
    });
    await fast.run;
    const normal = compress(makeFile(), {
      track: { width: 1920, height: 1080, frameRate: 30 },
    });
    await normal.run;

    expect(fast.record?.initOptions?.video).toMatchObject({ frameRate: 30 });
    expect(normal.record?.initOptions?.video).not.toHaveProperty('frameRate');
  });

  it('прогресс библиотеки доходит до экрана как есть', async () => {
    const onProgress = vi.fn<(fraction: number) => void>();
    const { run } = compress(makeFile(), { progress: [0.25, 0.75] }, { onProgress });

    await run;

    expect(onProgress.mock.calls.map(([fraction]) => fraction)).toEqual([0.25, 0.75]);
  });
});

describe('compressVideo — уходит исходник', () => {
  it('результат не меньше 80% исходника — берём исходник', async () => {
    const file = makeFile();
    const { run } = compress(file, { outputBytes: 8 * MIB });

    expect(await run).toBe(file);
  });

  it('библиотека считает преобразование невозможным (isValid: false)', async () => {
    const file = makeFile();
    const { run, record } = compress(file, { isValid: false });

    expect(await run).toBe(file);
    expect(record?.execute).not.toHaveBeenCalled();
  });

  it('хоть одна дорожка была бы выброшена (звук, который нечем сохранить)', async () => {
    const file = makeFile();
    const { run, record } = compress(file, {
      discardedTracks: [{ reason: 'cannot_copy' }],
    });

    expect(await run).toBe(file);
    expect(record?.execute).not.toHaveBeenCalled();
  });

  it('библиотека закончила, но буфер не отдала', async () => {
    const file = makeFile();
    const { run } = compress(file, { outputBytes: null });

    expect(await run).toBe(file);
  });

  it('кодировщик упал посреди сжатия', async () => {
    const file = makeFile();
    const { run, record } = compress(file, { execute: 'fail' });

    expect(await run).toBe(file);
    expect(record?.disposed).toBe(1);
  });

  it('кусок с библиотекой не загрузился', async () => {
    const file = makeFile();
    const { run } = compress(
      file,
      new Error('Failed to fetch dynamically imported module'),
    );

    expect(await run).toBe(file);
  });

  it('в файле нет видеодорожки', async () => {
    const file = makeFile();
    const { run } = compress(file, { track: null });

    expect(await run).toBe(file);
  });

  it('размер кадра не прочитался', async () => {
    const file = makeFile();
    const { run } = compress(file, { track: { width: 0, height: 0, frameRate: 30 } });

    expect(await run).toBe(file);
  });

  it('в браузере нет WebCodecs — библиотеку даже не загружаем', async () => {
    vi.unstubAllGlobals();
    const file = makeFile();
    const { run, loadLibrary } = compress(file);

    expect(await run).toBe(file);
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it('маленький файл — одна часть, сжимать нет смысла', async () => {
    const file = makeFile(MIB);
    const { run, loadLibrary } = compress(file);

    expect(await run).toBe(file);
    expect(loadLibrary).not.toHaveBeenCalled();
  });
});

describe('compressVideo — настоящая библиотека', () => {
  it('ленивый кусок грузится, а файл, который не видео, уходит как есть', async () => {
    // Настоящие байты нужной длины: библиотека читает Blob по-настоящему, а
    // подменённый размер увёл бы её чтение за конец файла.
    const file = new File([new Uint8Array(SOURCE_BYTES)], 'not-a-video.mov');

    const result = await compressVideo(file, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    });

    expect(result).toBe(file);
  });
});

describe('compressVideo — отмена', () => {
  it('отмена посреди сжатия останавливает библиотеку и отвергает промис как отмену', async () => {
    const controller = new AbortController();
    const { run, record } = compress(
      makeFile(),
      { execute: 'hang' },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(record?.execute).toHaveBeenCalled());

    controller.abort();

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(record?.cancel).toHaveBeenCalledTimes(1);
    expect(record?.disposed).toBe(1);
  });

  it('уже отменённый сигнал — сжатие не начинается', async () => {
    const controller = new AbortController();
    controller.abort();
    const { run, record } = compress(makeFile(), {}, { signal: controller.signal });

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(record?.execute).not.toHaveBeenCalled();
  });
});

describe('canCompressVideo', () => {
  it('нужен кодировщик WebCodecs и файл крупнее одной части', () => {
    expect(canCompressVideo(SOURCE_BYTES)).toBe(true);
    expect(canCompressVideo(MIB)).toBe(false);
    vi.unstubAllGlobals();
    expect(canCompressVideo(SOURCE_BYTES)).toBe(false);
  });
});
