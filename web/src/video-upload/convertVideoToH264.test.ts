// Перегон старого видео с проверкой копии (ADR-0189) на подменённой библиотеке
// (loadLibrary), как compressVideo.test.ts: настоящего WebCodecs в jsdom нет.
// Проверяется то, ради чего оригинал можно заменить: перегон сохранил все
// дорожки, копия открывается как H.264 и той же длины. Каждый отказ — `null`.
// Приведение типа (`as unknown as`) — в `makeLibrary`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediabunnyLibrary } from './compressVideo';
import { convertVideoToH264 } from './convertVideoToH264';

const MIB = 1024 * 1024;
const SOURCE_BYTES = 9 * MIB;
const COPY_BYTES = 3 * MIB;

interface Facts {
  duration: number;
  /** `null` — в файле нет видеодорожки. */
  videoCodec: string | null;
  /** Чтение файла падает, начиная с этого по счёту (с 1) открытия. */
  failFromRead?: number;
}

interface Scenario {
  /** Кодек исходника для самого перегона (compressVideo.ts). */
  codec?: string;
  isValid?: boolean;
  discardedTracks?: unknown[];
  execute?: 'ok' | 'fail' | 'hang';
  source?: Partial<Facts>;
  copy?: Partial<Facts>;
}

function makeLibrary(scenario: Scenario = {}) {
  const {
    codec = 'hevc',
    isValid = true,
    discardedTracks = [],
    execute = 'ok',
  } = scenario;
  const sourceFacts: Facts = { duration: 10, videoCodec: codec, ...scenario.source };
  const copyFacts: Facts = { duration: 10, videoCodec: 'avc', ...scenario.copy };
  const record = { executed: 0, disposed: 0, reads: new Map<Facts, number>() };

  class Input {
    private readonly facts: Facts;
    private readonly read: number;
    constructor(options: { source: { blob: Blob } }) {
      this.facts = options.source.blob.size === SOURCE_BYTES ? sourceFacts : copyFacts;
      this.read = (record.reads.get(this.facts) ?? 0) + 1;
      record.reads.set(this.facts, this.read);
    }
    getPrimaryVideoTrack() {
      const { failFromRead } = this.facts;
      if (failFromRead !== undefined && this.read >= failFromRead) {
        return Promise.reject(new Error('файл не читается'));
      }
      const { videoCodec } = this.facts;
      return Promise.resolve(
        videoCodec === null
          ? null
          : {
              getCodec: () => Promise.resolve(videoCodec),
              getDisplayWidth: () => Promise.resolve(1920),
              getDisplayHeight: () => Promise.resolve(1080),
              computePacketStats: () => Promise.resolve({ averagePacketRate: 30 }),
            },
      );
    }
    computeDuration() {
      return Promise.resolve(this.facts.duration);
    }
    dispose() {
      record.disposed += 1;
    }
  }
  class Conversion {
    isValid = isValid;
    discardedTracks = discardedTracks;
    onProgress?: (fraction: number) => void;
    private fail?: (error: Error) => void;
    constructor(
      private readonly options: { output: { options: { target: BufferLike } } },
    ) {}
    static init(options: { output: { options: { target: BufferLike } } }) {
      return Promise.resolve(new Conversion(options));
    }
    cancel() {
      this.fail?.(new Error('canceled'));
      return Promise.resolve();
    }
    execute() {
      record.executed += 1;
      if (execute === 'fail') return Promise.reject(new Error('кодек отказал'));
      if (execute === 'hang') {
        return new Promise<void>((_resolve, reject) => {
          this.fail = reject;
        });
      }
      this.onProgress?.(0.5);
      this.options.output.options.target.buffer = new ArrayBuffer(COPY_BYTES);
      return Promise.resolve();
    }
  }
  interface BufferLike {
    buffer: ArrayBuffer | null;
  }
  const lib = {
    Input,
    Output: class {
      constructor(readonly options: { target: BufferLike }) {}
    },
    Conversion,
    BlobSource: class {
      constructor(readonly blob: Blob) {}
    },
    BufferTarget: class {
      buffer: ArrayBuffer | null = null;
    },
    Mp4OutputFormat: class {},
    Quality: class {},
    ALL_FORMATS: [],
  } as unknown as MediabunnyLibrary;
  return { lib, record };
}

function makeSource(): Blob {
  const blob = new Blob([new Uint8Array(1)], { type: 'video/quicktime' });
  Object.defineProperty(blob, 'size', { value: SOURCE_BYTES });
  return blob;
}

function convert(
  scenario: Scenario | Error = {},
  signal: AbortSignal = new AbortController().signal,
) {
  const source = makeSource();
  const library = scenario instanceof Error ? undefined : makeLibrary(scenario);
  const loadLibrary = vi.fn(() =>
    library ? Promise.resolve(library.lib) : Promise.reject(scenario as Error),
  );
  const run = convertVideoToH264(source, { signal, loadLibrary });
  return { run, source, loadLibrary, record: library?.record };
}

beforeEach(() => {
  vi.stubGlobal('VideoEncoder', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('convertVideoToH264 — копия принята', () => {
  it('HEVC перегнан: новый MP4 в H.264 той же длины', async () => {
    const { run, source } = convert();

    const copy = await run;

    expect(copy).not.toBeNull();
    expect(copy).not.toBe(source);
    expect(copy?.type).toBe('video/mp4');
    expect(copy?.size).toBe(COPY_BYTES);
  });

  it('длина разошлась в пределах допуска (полсекунды) — принята', async () => {
    const { run } = convert({ copy: { duration: 10.4 } });

    expect(await run).not.toBeNull();
  });

  it('обе проверки читают файлы и освобождают их', async () => {
    const { run, record } = convert();

    await run;

    // Исходник и копия при проверке + исходник самого перегона.
    expect(record?.disposed).toBe(3);
  });
});

// Оригинал заменяется копией и хранится дальше, но заменять его можно только на
// копию, в которой нет сомнений: любой отказ ниже — `null`, видео не трогается.
describe('convertVideoToH264 — копия отвергнута', () => {
  it('перегон выбросил дорожку (звук, который нечем сохранить) — null', async () => {
    const { run } = convert({ discardedTracks: [{ reason: 'cannot_copy' }] });

    expect(await run).toBeNull();
  });

  it('библиотека считает перегон невозможным (нет декодера) — null', async () => {
    const { run, record } = convert({ isValid: false });

    expect(await run).toBeNull();
    expect(record?.executed).toBe(0);
  });

  it('кодировщик упал посреди перегона — null', async () => {
    const { run } = convert({ execute: 'fail' });

    expect(await run).toBeNull();
  });

  it('копия вдвое короче — null', async () => {
    const { run } = convert({ copy: { duration: 5 } });

    expect(await run).toBeNull();
  });

  it('копия длиннее допуска — null', async () => {
    const { run } = convert({ copy: { duration: 10.6 } });

    expect(await run).toBeNull();
  });

  it('длительность исходника не прочиталась (0) — сравнивать не с чем, null', async () => {
    const { run } = convert({ source: { duration: 0 }, copy: { duration: 0 } });

    expect(await run).toBeNull();
  });

  it.each(['hevc', 'vp9', null])(
    'в копии первая видеодорожка не H.264 (%s) — null',
    async (videoCodec) => {
      const { run } = convert({ copy: { videoCodec } });

      expect(await run).toBeNull();
    },
  );

  it('копию не удалось открыть — null', async () => {
    const { run } = convert({ copy: { failFromRead: 1 } });

    expect(await run).toBeNull();
  });

  it('исходник при проверке не открылся (сам перегон его прочитал) — null', async () => {
    const { run, record } = convert({ source: { failFromRead: 2 } });

    expect(await run).toBeNull();
    expect(record?.executed).toBe(1);
  });
});

describe('convertVideoToH264 — настоящая библиотека', () => {
  it('ленивый кусок грузится, а байты, которые не видео, дают null без ошибки', async () => {
    const notVideo = new Blob([new Uint8Array(64)]);

    const copy = await convertVideoToH264(notVideo, {
      signal: new AbortController().signal,
    });

    expect(copy).toBeNull();
  });
});

describe('convertVideoToH264 — перегонять нечем', () => {
  it('в браузере нет WebCodecs — библиотеку не грузим', async () => {
    vi.unstubAllGlobals();
    const { run, loadLibrary } = convert();

    expect(await run).toBeNull();
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it('кусок с библиотекой не загрузился — null', async () => {
    const { run } = convert(new Error('Failed to fetch dynamically imported module'));

    expect(await run).toBeNull();
  });
});

describe('convertVideoToH264 — отмена', () => {
  it('отмена посреди перегона отвергает промис как отмену, не как отказ', async () => {
    const controller = new AbortController();
    const { run, record } = convert({ execute: 'hang' }, controller.signal);
    await vi.waitFor(() => expect(record?.executed).toBe(1));

    controller.abort();

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });
});
