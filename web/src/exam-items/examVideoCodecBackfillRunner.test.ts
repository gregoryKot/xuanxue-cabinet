// Прогон «Перегнать видео» без DOM и без сети: чтение кодека, перегон, загрузка и
// маршруты подменены параметрами (ADR-0189). Главное, что здесь держится, — оригинал
// не теряется: `replace` зовётся только после всех проверок, а кодек H.264
// записывается только тому, что H.264 и есть.
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import type { VideoProbe } from '../video-upload/probeVideoCodec';
import {
  runCodecBackfill,
  type CodecBackfillProgress,
  type RunCodecBackfillParams,
} from './examVideoCodecBackfillRunner';

const COPY_BYTES = 5;

function ids(...list: string[]) {
  return list.map((id) => ({ id }));
}

/** Список отдаёт пачки по очереди; когда пачки кончились — пусто. */
function batches(...list: { id: string }[][]) {
  const queue = [...list];
  return vi.fn(() => Promise.resolve(queue.shift() ?? []));
}

const HEVC: VideoProbe = { codec: 'hevc', canConvert: true };
const AVC: VideoProbe = { codec: 'avc', canConvert: true };

function copy(): Blob {
  return new Blob([new Uint8Array(COPY_BYTES)], { type: 'video/mp4' });
}

function setup(overrides: Partial<RunCodecBackfillParams> = {}) {
  const progress: CodecBackfillProgress[] = [];
  const params: RunCodecBackfillParams = {
    signal: new AbortController().signal,
    total: null,
    listPending: batches(),
    probe: vi.fn(() => Promise.resolve(HEVC)),
    markCodec: vi.fn(() => Promise.resolve()),
    convert: vi.fn(() => Promise.resolve<Blob | null>(copy())),
    upload: vi.fn((file: Blob) => Promise.resolve({ id: 'new', sizeBytes: file.size })),
    replace: vi.fn(() => Promise.resolve()),
    onProgress: (p) => progress.push(p),
    ...overrides,
  };
  return { params, progress, run: () => runCodecBackfill(params) };
}

describe('runCodecBackfill — перегнано', () => {
  it('HEVC: скачано и перегнано, копия загружена, затем подмена файла', async () => {
    const order: string[] = [];
    const { params, run } = setup({
      total: 1,
      listPending: batches(ids('a')),
      probe: vi.fn(() => {
        order.push('probe');
        return Promise.resolve(HEVC);
      }),
      convert: vi.fn(() => {
        order.push('convert');
        return Promise.resolve(copy());
      }),
      upload: vi.fn((file: Blob) => {
        order.push('upload');
        return Promise.resolve({ id: 'new', sizeBytes: file.size });
      }),
      replace: vi.fn(() => {
        order.push('replace');
        return Promise.resolve();
      }),
    });

    const result = await run();

    expect(result).toEqual({
      converted: 1,
      alreadyH264: 0,
      failed: 0,
      total: 1,
      error: null,
      cancelled: false,
    });
    expect(order).toEqual(['probe', 'convert', 'upload', 'replace']);
    expect(params.replace).toHaveBeenCalledWith('a', 'new', params.signal);
    // Кодек перегнанного видео пишет загрузка копии (complete), а не прогон.
    expect(params.markCodec).not.toHaveBeenCalled();
  });

  it('кодек не прочитан, но браузер может перегнать — перегоняет', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      probe: vi.fn(() => Promise.resolve<VideoProbe>({ codec: null, canConvert: true })),
    });

    const result = await run();

    expect(result.converted).toBe(1);
    expect(params.replace).toHaveBeenCalledTimes(1);
  });
});

describe('runCodecBackfill — уже H.264', () => {
  it('кодек записывается, файл не скачивается и не заменяется', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      probe: vi.fn(() => Promise.resolve(AVC)),
    });

    const result = await run();

    expect(result).toMatchObject({ converted: 0, alreadyH264: 1, failed: 0 });
    expect(params.markCodec).toHaveBeenCalledWith('a', 'avc', params.signal);
    expect(params.convert).not.toHaveBeenCalled();
    expect(params.upload).not.toHaveBeenCalled();
    expect(params.replace).not.toHaveBeenCalled();
  });

  it('H.264 помечается, даже если браузер перегонять не умеет', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      probe: vi.fn(() =>
        Promise.resolve<VideoProbe>({ codec: 'avc', canConvert: false }),
      ),
    });

    expect(await run()).toMatchObject({ alreadyH264: 1, failed: 0 });
    expect(params.markCodec).toHaveBeenCalledWith('a', 'avc', params.signal);
  });
});

describe('runCodecBackfill — перегнать нельзя', () => {
  it('браузер не умеет (нет декодера): не качает, записывает настоящий кодек, «не вышло»', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      probe: vi.fn(() =>
        Promise.resolve<VideoProbe>({ codec: 'hevc', canConvert: false }),
      ),
    });

    const result = await run();

    expect(result).toMatchObject({ converted: 0, failed: 1 });
    expect(params.convert).not.toHaveBeenCalled();
    expect(params.markCodec).toHaveBeenCalledWith('a', 'hevc', params.signal);
    expect(params.replace).not.toHaveBeenCalled();
  });

  it('перегон или проверка копии отказали (null): подмены нет, avc не записывается', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      convert: vi.fn(() => Promise.resolve(null)),
    });

    const result = await run();

    expect(result).toMatchObject({ converted: 0, failed: 1 });
    expect(params.upload).not.toHaveBeenCalled();
    expect(params.replace).not.toHaveBeenCalled();
    expect(params.markCodec).toHaveBeenCalledTimes(1);
    expect(params.markCodec).toHaveBeenCalledWith('a', 'hevc', params.signal);
    expect(params.markCodec).not.toHaveBeenCalledWith('a', 'avc', expect.anything());
  });

  it('кодек не прочитан и перегнать нельзя — записывать нечего, «не вышло»', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      probe: vi.fn(() => Promise.resolve<VideoProbe>({ codec: null, canConvert: false })),
    });

    expect(await run()).toMatchObject({ failed: 1 });
    expect(params.markCodec).not.toHaveBeenCalled();
  });
});

// Проверка 4 из требований владельца: сервер хранит ровно то, что мы отправили.
describe('runCodecBackfill — загрузка копии не прошла проверку', () => {
  it('на сервере другой размер, чем у копии — подмены нет, «не вышло»', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      upload: vi.fn(() => Promise.resolve({ id: 'new', sizeBytes: COPY_BYTES - 1 })),
    });

    const result = await run();

    expect(result).toMatchObject({ converted: 0, failed: 1 });
    expect(params.replace).not.toHaveBeenCalled();
    expect(params.markCodec).not.toHaveBeenCalledWith('a', 'avc', expect.anything());
  });

  it('загрузка вернула id самого оригинала — подмены нет', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a')),
      upload: vi.fn((file: Blob) => Promise.resolve({ id: 'a', sizeBytes: file.size })),
    });

    expect(await run()).toMatchObject({ converted: 0, failed: 1 });
    expect(params.replace).not.toHaveBeenCalled();
  });

  it('загрузка оборвалась (complete не ответил) — подмены нет, остальные идут дальше', async () => {
    const upload = vi
      .fn<RunCodecBackfillParams['upload']>()
      .mockRejectedValueOnce(new Error('Не удалось загрузить видео.'))
      .mockImplementation((file) => Promise.resolve({ id: 'new', sizeBytes: file.size }));
    const { params, run } = setup({ listPending: batches(ids('a', 'b')), upload });

    const result = await run();

    expect(result).toMatchObject({ converted: 1, failed: 1 });
    expect(params.replace).toHaveBeenCalledTimes(1);
    expect(params.replace).toHaveBeenCalledWith('b', 'new', params.signal);
  });

  it('сервер не принял подмену — «не вышло», следующее видео идёт', async () => {
    const replace = vi
      .fn<RunCodecBackfillParams['replace']>()
      .mockRejectedValueOnce(new ApiError('Сбой', 500, 'unknown'))
      .mockResolvedValue(undefined);
    const { run } = setup({ listPending: batches(ids('a', 'b')), replace });

    expect(await run()).toMatchObject({ converted: 1, failed: 1 });
  });
});

describe('runCodecBackfill — ошибка одного видео не останавливает остальные', () => {
  it('скачивание упало на сети — «не вышло», дальше идёт', async () => {
    const convert = vi
      .fn<RunCodecBackfillParams['convert']>()
      .mockRejectedValueOnce(new ApiError('Нет связи', 0, 'network'))
      .mockResolvedValue(copy());
    const { run } = setup({ listPending: batches(ids('a', 'b')), convert });

    expect(await run()).toMatchObject({ converted: 1, failed: 1 });
  });

  it('запись кодека не прошла — «не вышло», дальше идёт', async () => {
    const markCodec = vi
      .fn<RunCodecBackfillParams['markCodec']>()
      .mockRejectedValueOnce(new ApiError('Сбой', 500, 'unknown'))
      .mockResolvedValue(undefined);
    const { run } = setup({
      listPending: batches(ids('a', 'b')),
      probe: vi.fn(() => Promise.resolve(AVC)),
      markCodec,
    });

    expect(await run()).toMatchObject({ alreadyH264: 1, failed: 1 });
  });
});

describe('runCodecBackfill — отказ в доступе останавливает прогон', () => {
  it.each([401, 403])(
    '%s при скачивании: сообщение про вход и ни одной подмены',
    async (status) => {
      const { params, run } = setup({
        listPending: batches(ids('a', 'b')),
        convert: vi.fn(() =>
          Promise.reject(new ApiError('Нет прав', status, 'forbidden')),
        ),
      });

      const result = await run();

      expect(result.error).toContain('Нет доступа');
      expect(result.error).toContain('«Перегнать видео»');
      expect(result.failed).toBe(0);
      expect(params.convert).toHaveBeenCalledTimes(1);
      expect(params.replace).not.toHaveBeenCalled();
    },
  );

  it('403 при записи кодека — тоже остановка', async () => {
    const { params, run } = setup({
      listPending: batches(ids('a', 'b')),
      probe: vi.fn(() => Promise.resolve(AVC)),
      markCodec: vi.fn(() => Promise.reject(new ApiError('Нет прав', 403, 'forbidden'))),
    });

    expect((await run()).error).toContain('Нет доступа');
    expect(params.markCodec).toHaveBeenCalledTimes(1);
  });

  it('403 при подмене — остановка', async () => {
    const { run } = setup({
      listPending: batches(ids('a', 'b')),
      replace: vi.fn(() => Promise.reject(new ApiError('Нет прав', 403, 'forbidden'))),
    });

    expect((await run()).error).toContain('Нет доступа');
  });

  it('список не отдали из-за 401 — сообщение про вход', async () => {
    const { run } = setup({
      listPending: vi.fn(() =>
        Promise.reject(new ApiError('Нет входа', 401, 'unauthorized')),
      ),
    });

    expect((await run()).error).toContain('Нет доступа');
  });

  it('список не загрузился по другой причине — про связь и что сделанное сохранено', async () => {
    const { run } = setup({
      listPending: vi.fn(() => Promise.reject(new ApiError('Сеть', 0, 'network'))),
    });

    const result = await run();

    expect(result.error).toContain('Список видео не загрузился');
    expect(result.error).toContain('«Перегнать видео»');
  });
});

describe('runCodecBackfill — пачки и список уже тронутых', () => {
  it('идёт по пачкам, пока список не опустеет', async () => {
    const list = batches(ids('a'), ids('b'), []);
    const { run } = setup({ total: 2, listPending: list });

    const result = await run();

    expect(result.converted).toBe(2);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('не перегнавшееся видео остаётся в списке сервера, но второй раз не берётся', async () => {
    // Сервер отдаёт ту же голову, пока видео не стало H.264.
    const list = batches(ids('a'), ids('a'));
    const { params, run } = setup({
      listPending: list,
      convert: vi.fn(() => Promise.resolve(null)),
    });

    const result = await run();

    expect(result).toMatchObject({ failed: 1, error: null, cancelled: false });
    expect(params.convert).toHaveBeenCalledTimes(1);
  });

  it('пачка из одних тронутых видео заканчивает прогон', async () => {
    const list = batches(ids('a'), ids('a', 'b'), ids('a', 'b'));
    const { params, run } = setup({
      listPending: list,
      convert: vi.fn(() => Promise.resolve(null)),
    });

    const result = await run();

    expect(result.failed).toBe(2);
    expect(params.convert).toHaveBeenCalledTimes(2);
  });

  it('сводки нет — итог равен длине первой пачки; ход виден после каждого видео', async () => {
    const { progress, run } = setup({ listPending: batches(ids('a', 'b', 'c')) });

    const result = await run();

    expect(result.total).toBe(3);
    expect(progress).toEqual([
      { converted: 1, alreadyH264: 0, failed: 0, total: 3 },
      { converted: 2, alreadyH264: 0, failed: 0, total: 3 },
      { converted: 3, alreadyH264: 0, failed: 0, total: 3 },
    ]);
  });

  it('сводка отстала от списка — итог не меньше сделанного', async () => {
    const { run } = setup({ total: 1, listPending: batches(ids('a', 'b')) });

    expect((await run()).total).toBe(2);
  });

  it('пустой список — честный ноль, а не ошибка', async () => {
    const { params, run } = setup({ total: 0 });

    expect(await run()).toEqual({
      converted: 0,
      alreadyH264: 0,
      failed: 0,
      total: 0,
      error: null,
      cancelled: false,
    });
    expect(params.probe).not.toHaveBeenCalled();
  });

  it('смесь: H.264 помечен, HEVC перегнан, один не вышел', async () => {
    const probe = vi.fn((id: string) => Promise.resolve(id === 'a' ? AVC : HEVC));
    const convert = vi.fn((id: string) => Promise.resolve(id === 'c' ? null : copy()));
    const { run } = setup({ listPending: batches(ids('a', 'b', 'c')), probe, convert });

    expect(await run()).toMatchObject({
      converted: 1,
      alreadyH264: 1,
      failed: 1,
      total: 3,
    });
  });
});

describe('runCodecBackfill — отмена', () => {
  it('сигнал уже отменён — не делает ничего', async () => {
    const controller = new AbortController();
    controller.abort();
    const { params, run } = setup({ signal: controller.signal });

    const result = await run();

    expect(result.cancelled).toBe(true);
    expect(params.listPending).not.toHaveBeenCalled();
  });

  it('отмена посреди перегона: подмены нет, прогон отменён, а не «не вышло»', async () => {
    const controller = new AbortController();
    const { params, run } = setup({
      signal: controller.signal,
      listPending: batches(ids('a', 'b')),
      convert: vi.fn(() => {
        controller.abort();
        return Promise.reject(new DOMException('Сжатие отменено.', 'AbortError'));
      }),
    });

    const result = await run();

    expect(result).toMatchObject({ cancelled: true, failed: 0, error: null });
    expect(params.replace).not.toHaveBeenCalled();
    expect(params.convert).toHaveBeenCalledTimes(1);
  });

  it('отмена во время загрузки списка — отменён, без сообщения об ошибке', async () => {
    const controller = new AbortController();
    const { run } = setup({
      signal: controller.signal,
      listPending: vi.fn(() => {
        controller.abort();
        return Promise.reject(new ApiError('Сеть', 0, 'network'));
      }),
    });

    expect(await run()).toMatchObject({ cancelled: true, error: null });
  });

  it('отмена после последнего шага видео — следующее не начинается', async () => {
    const controller = new AbortController();
    const { params, run } = setup({
      signal: controller.signal,
      listPending: batches(ids('a', 'b')),
      replace: vi.fn(() => {
        controller.abort();
        return Promise.resolve();
      }),
    });

    const result = await run();

    expect(result.cancelled).toBe(true);
    expect(params.probe).toHaveBeenCalledTimes(1);
  });
});
