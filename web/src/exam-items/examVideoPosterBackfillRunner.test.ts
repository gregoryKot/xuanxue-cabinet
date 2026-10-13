// Прогон без DOM и без сети: маршруты и снимок подменены параметрами (ADR-0182).
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import {
  runPosterBackfill,
  type PosterBackfillProgress,
  type RunPosterBackfillParams,
} from './examVideoPosterBackfillRunner';

const POSTER = 'AQID';

function ids(...list: string[]) {
  return list.map((id) => ({ id }));
}

/** Список отдаёт партии по очереди; когда партии кончились — пусто. */
function batches(...list: { id: string }[][]) {
  const queue = [...list];
  return vi.fn(() => Promise.resolve(queue.shift() ?? []));
}

function setup(overrides: Partial<RunPosterBackfillParams> = {}) {
  const progress: PosterBackfillProgress[] = [];
  const params: RunPosterBackfillParams = {
    signal: new AbortController().signal,
    total: null,
    listWithoutPoster: batches(),
    capture: vi.fn(() => Promise.resolve<string | null>(POSTER)),
    savePoster: vi.fn(() => Promise.resolve()),
    onProgress: (p) => progress.push(p),
    ...overrides,
  };
  return { params, progress, run: () => runPosterBackfill(params) };
}

describe('runPosterBackfill — успех', () => {
  it('снимает каждое видео пачки, пишет кадр и считает «снято»', async () => {
    const { params, progress, run } = setup({
      total: 2,
      listWithoutPoster: batches(ids('a', 'b')),
    });

    const result = await run();

    expect(result).toEqual({
      done: 2,
      failed: 0,
      total: 2,
      error: null,
      cancelled: false,
    });
    expect(params.savePoster).toHaveBeenCalledWith('a', POSTER, params.signal);
    expect(params.savePoster).toHaveBeenCalledWith('b', POSTER, params.signal);
    expect(progress.map((p) => p.done)).toEqual([1, 2]);
  });

  it('идёт по пачкам, пока список не опустеет', async () => {
    const list = batches(ids('a'), ids('b'), []);
    const { run } = setup({ total: 2, listWithoutPoster: list });

    const result = await run();

    expect(result.done).toBe(2);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('сводки нет — итог равен длине первой пачки', async () => {
    const { progress, run } = setup({ listWithoutPoster: batches(ids('a', 'b', 'c')) });

    const result = await run();

    expect(result.total).toBe(3);
    expect(progress[0]).toEqual({ done: 1, failed: 0, total: 3 });
  });

  it('сводка отстала от списка — итог не меньше сделанного', async () => {
    const { run } = setup({ total: 1, listWithoutPoster: batches(ids('a', 'b')) });

    expect((await run()).total).toBe(2);
  });

  it('пустой список с первого раза — конец без единого снимка', async () => {
    const { params, run } = setup({ total: 0 });

    expect(await run()).toEqual({
      done: 0,
      failed: 0,
      total: 0,
      error: null,
      cancelled: false,
    });
    expect(params.capture).not.toHaveBeenCalled();
  });
});

describe('runPosterBackfill — что не снялось', () => {
  it('браузер не открыл формат — «не вышло», остальные идут дальше', async () => {
    const capture = vi.fn((id: string) => Promise.resolve(id === 'a' ? null : POSTER));
    const { params, run } = setup({
      capture,
      listWithoutPoster: batches(ids('a', 'b')),
    });

    const result = await run();

    expect(result).toMatchObject({ done: 1, failed: 1, error: null });
    expect(params.savePoster).toHaveBeenCalledTimes(1);
  });

  it('неснятое видео сервер отдаёт снова и снова — по кругу прогон не ходит', async () => {
    const list = vi.fn(() => Promise.resolve(ids('a', 'b')));
    const capture = vi.fn(() => Promise.resolve<string | null>(null));
    const { run } = setup({ listWithoutPoster: list, capture });

    const result = await run();

    expect(result).toMatchObject({ done: 0, failed: 2, error: null });
    expect(capture).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('записанное видео, которое список всё равно вернул, второй раз не снимается', async () => {
    const list = vi.fn(() => Promise.resolve(ids('a')));
    const { params, run } = setup({ listWithoutPoster: list });

    const result = await run();

    expect(result.done).toBe(1);
    expect(params.capture).toHaveBeenCalledTimes(1);
  });

  it('сбой записи кадра (сервер 500, сеть) — «не вышло», прогон идёт дальше', async () => {
    const savePoster = vi
      .fn<RunPosterBackfillParams['savePoster']>()
      .mockRejectedValueOnce(new ApiError('Сбой', 500, 'unknown'))
      .mockResolvedValue(undefined);
    const { run } = setup({ savePoster, listWithoutPoster: batches(ids('a', 'b')) });

    expect(await run()).toMatchObject({ done: 1, failed: 1, error: null });
  });
});

describe('runPosterBackfill — остановка', () => {
  it.each([401, 403])(
    'запись кадра ответила %i — прогон стоит с текстом ошибки',
    async (status) => {
      const savePoster = vi.fn(() =>
        Promise.reject(new ApiError('Нет прав', status, 'forbidden')),
      );
      const { run } = setup({ savePoster, listWithoutPoster: batches(ids('a', 'b')) });

      const result = await run();

      expect(result.error).toMatch(/Войдите заново/);
      expect(result.cancelled).toBe(false);
      expect(savePoster).toHaveBeenCalledTimes(1);
    },
  );

  it('список ответил 403 — тот же текст про доступ', async () => {
    const { run } = setup({
      listWithoutPoster: vi.fn(() =>
        Promise.reject(new ApiError('Нет прав', 403, 'forbidden')),
      ),
    });

    expect((await run()).error).toMatch(/Войдите заново/);
  });

  it('список не загрузился по сети — текст про связь и что нажать', async () => {
    const { run } = setup({
      listWithoutPoster: vi.fn(() => Promise.reject(new Error('offline'))),
    });

    expect((await run()).error).toMatch(/Проверьте связь/);
  });

  it('отмена посреди прогона — cancelled, дальше видео не трогаем, прогресс молчит', async () => {
    const controller = new AbortController();
    const capture = vi.fn(() => {
      controller.abort();
      return Promise.resolve<string | null>(POSTER);
    });
    const { params, progress, run } = setup({
      signal: controller.signal,
      capture,
      listWithoutPoster: batches(ids('a', 'b')),
    });

    const result = await run();

    expect(result.cancelled).toBe(true);
    expect(params.savePoster).not.toHaveBeenCalled();
    expect(progress).toEqual([]);
  });

  it('отмена пришла, пока снимался кадр, — cancelled, кадр не пишем', async () => {
    const controller = new AbortController();
    // Настоящий captureVideoPoster по отмене отдаёт null, а не бросает.
    const capture = vi.fn(() => {
      controller.abort();
      return Promise.resolve<string | null>(null);
    });
    const { params, run } = setup({
      signal: controller.signal,
      capture,
      listWithoutPoster: batches(ids('a')),
    });

    expect(await run()).toMatchObject({ cancelled: true, failed: 0, error: null });
    expect(params.savePoster).not.toHaveBeenCalled();
  });

  it('отмена пришла во время записи кадра — cancelled, не «не вышло»', async () => {
    const controller = new AbortController();
    const savePoster = vi.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    const { progress, run } = setup({
      signal: controller.signal,
      savePoster,
      listWithoutPoster: batches(ids('a')),
    });

    expect(await run()).toMatchObject({ cancelled: true, done: 0, failed: 0 });
    expect(progress).toEqual([]);
  });

  it('отмена во время запроса списка — cancelled без ошибки', async () => {
    const controller = new AbortController();
    const { run } = setup({
      signal: controller.signal,
      listWithoutPoster: vi.fn(() => {
        controller.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      }),
    });

    expect(await run()).toMatchObject({ cancelled: true, error: null });
  });
});
