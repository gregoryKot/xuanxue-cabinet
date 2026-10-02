// Регрессия на жалобу владельца 2026-10-01: «видео плохо грузится на слабом
// интернете, при сворачивании приложения умирает, а если не догрузилось —
// надо перезагружать страницу целиком». Хук проверяем через настоящий
// плеер: так видно и перезагрузку элемента, и плашку «Загрузить снова».
//
// jsdom медиа не умеет: `load`/`play` заглушены, а `readyState`, `paused`,
// `currentTime` и `error` подменяются на экземпляре. Заглушка `load` ведёт
// себя как настоящий: сбрасывает позицию, ошибку и готовность — иначе тест
// на «позиция возвращается» проходил бы и без восстановления.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { ExamVideoPlayer } from './ExamVideoPlayer';
import { useVideoRecovery } from './useVideoRecovery';
import { MAX_AUTO_RELOADS, STALL_RELOAD_MS } from './videoRecoveryRules';

const RESUME_SECOND = 42;
const PROGRESS_INTERVAL_MS = 4000;
const NETWORK_ERROR = { code: 2 };
// MEDIA_ERR_SRC_NOT_SUPPORTED: браузер не умеет декодировать файл (iPhone HEVC
// в Firefox) — код приходит до первых метаданных.
const UNSUPPORTED_ERROR = { code: 4 };
const DROPPED_TEXT = /Видео не догрузилось/;
const UNSUPPORTED_TEXT = /Этот браузер не открывает такое видео/;
const UNSUPPORTED_TILE_TEXT = /Браузер не открывает это видео/;
const RETRY_NAME = 'Загрузить снова';
const DOWNLOAD_NAME = 'Скачать';

interface MediaState {
  readyState: number;
  paused: boolean;
  currentTime: number;
  error: { code: number } | null;
}

const PLAYING: Partial<MediaState> = {
  paused: false,
  currentTime: RESUME_SECOND,
  readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
};

let hidden = false;
let loadSpy: MockInstance;
let playSpy: MockInstance;

function stubMedia(video: HTMLVideoElement, initial: Partial<MediaState>): MediaState {
  const state: MediaState = {
    readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
    paused: true,
    currentTime: 0,
    error: null,
    ...initial,
  };
  Object.defineProperty(video, 'readyState', {
    configurable: true,
    get: () => state.readyState,
  });
  Object.defineProperty(video, 'paused', { configurable: true, get: () => state.paused });
  Object.defineProperty(video, 'error', { configurable: true, get: () => state.error });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => state.currentTime,
    set: (value: number) => {
      state.currentTime = value;
    },
  });
  // Настоящий load(): пауза, позиция 0, ошибки нет, данных нет.
  loadSpy.mockImplementation(() => {
    state.paused = true;
    state.currentTime = 0;
    state.error = null;
    state.readyState = HTMLMediaElement.HAVE_NOTHING;
  });
  return state;
}

function renderPlayer(
  initial: Partial<MediaState>,
  size: 'thumb' | 'tile' | 'full' = 'full',
  ids: { videoId?: string; answerVideoId?: string } = { videoId: 'vid1' },
) {
  const view = render(<ExamVideoPlayer {...ids} title="Вопрос" size={size} />);
  const video = view.container.querySelector('video');
  if (!video) throw new Error('video не отрисован');
  const state = stubMedia(video, initial);
  return { ...view, video, state };
}

function fire(target: Element | Document | Window, type: string) {
  fireEvent(target, new Event(type));
}

function failTimes(video: HTMLVideoElement, times: number) {
  for (let i = 0; i < times; i += 1) fire(video, 'error');
}

// `load()` в заглушке сбрасывает ошибку, как настоящий, поэтому каждый следующий
// отказ надо выставить заново.
function failWith(video: HTMLVideoElement, state: MediaState, error: { code: number }) {
  state.error = error;
  fire(video, 'error');
}

// Формат не открывается: тот же код дважды подряд, метаданных не было.
function failAsUnsupported(video: HTMLVideoElement, state: MediaState) {
  failWith(video, state, UNSUPPORTED_ERROR);
  failWith(video, state, UNSUPPORTED_ERROR);
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// `play()` зовётся через промис — даём микрозадаче отработать внутри act.
async function fireLoadedMetadata(video: HTMLVideoElement) {
  await act(async () => {
    fire(video, 'loadedmetadata');
    await Promise.resolve();
  });
}

function setHidden(value: boolean) {
  hidden = value;
  fire(document, 'visibilitychange');
}

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  loadSpy = vi
    .spyOn(HTMLMediaElement.prototype, 'load')
    .mockImplementation(() => undefined);
  playSpy = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Возвращаем геттер из прототипа Document: свойство на экземпляре его закрывало.
  Reflect.deleteProperty(document, 'hidden');
});

// Хук вызывают с ref, который к элементу так и не прикрепили, — подписывать
// нечего, и кнопка «Загрузить снова» не должна падать.
function HarnessWithoutVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const { failure, retry } = useVideoRecovery(ref, '/api/exam-videos/none');
  return (
    <button type="button" onClick={retry}>
      {failure ? 'сбой' : 'норма'}
    </button>
  );
}

describe('видео — здоровая загрузка', () => {
  it('первый loadedmetadata без перезагрузки позицию и play() не трогает', async () => {
    const { video, state } = renderPlayer({ paused: true, currentTime: 7 });

    await fireLoadedMetadata(video);

    expect(state.currentTime).toBe(7);
    expect(playSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('progress у здорового видео таймер не заводит', () => {
    const { video } = renderPlayer(PLAYING);

    fire(video, 'progress');

    expect(vi.getTimerCount()).toBe(0);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('ref без элемента: подписывать нечего, retry ничего не ломает', () => {
    render(<HarnessWithoutVideo />);

    fireEvent.click(screen.getByRole('button', { name: 'норма' }));

    expect(screen.getByRole('button', { name: 'норма' })).toBeInTheDocument();
    expect(loadSpy).not.toHaveBeenCalled();
  });
});

describe('видео — ошибка загрузки', () => {
  it('error: один load(), после loadedmetadata секунда возвращается и видео играет', async () => {
    const { video, state } = renderPlayer(PLAYING);

    state.error = NETWORK_ERROR;
    fire(video, 'error');
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(state.currentTime).toBe(0);

    await fireLoadedMetadata(video);
    expect(state.currentTime).toBe(RESUME_SECOND);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('error на паузе: секунда возвращается, воспроизведение не стартует само', async () => {
    const { video, state } = renderPlayer({ ...PLAYING, paused: true });

    fire(video, 'error');
    await fireLoadedMetadata(video);

    expect(state.currentTime).toBe(RESUME_SECOND);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('отказ play() (политика автовоспроизведения) не роняет: видео стоит на своей секунде', async () => {
    playSpy.mockRejectedValue(new Error('NotAllowedError'));
    const { video, state } = renderPlayer(PLAYING);

    fire(video, 'error');
    await fireLoadedMetadata(video);

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(state.currentTime).toBe(RESUME_SECOND);
  });

  it('вторая ошибка до loadedmetadata не затирает позицию нулём', async () => {
    const { video, state } = renderPlayer(PLAYING);

    failTimes(video, 2);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    await fireLoadedMetadata(video);

    expect(state.currentTime).toBe(RESUME_SECOND);
  });

  it('видео не успело ничего проиграть: позиция 0 не выставляется заново', async () => {
    const { video, state } = renderPlayer({ paused: true, currentTime: 0 });

    fire(video, 'error');
    await fireLoadedMetadata(video);

    expect(state.currentTime).toBe(0);
    expect(playSpy).not.toHaveBeenCalled();
  });
});

describe('видео — тишина без данных (слабая связь)', () => {
  it('waiting при игре без единого progress 12 секунд — перезагрузка', () => {
    const { video } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    advance(STALL_RELOAD_MS - 1);
    expect(loadSpy).not.toHaveBeenCalled();

    advance(1);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('повторный waiting таймер не продлевает', () => {
    const { video } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    advance(STALL_RELOAD_MS / 2);
    fire(video, 'waiting');
    advance(STALL_RELOAD_MS / 2);

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('progress каждые несколько секунд — слабая, но живая связь, видео не трогаем', () => {
    const { video } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    for (let i = 0; i < 5; i += 1) {
      advance(PROGRESS_INTERVAL_MS);
      fire(video, 'progress');
    }
    expect(loadSpy).not.toHaveBeenCalled();

    advance(STALL_RELOAD_MS);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('пауза с метаданными: stalled и 12 секунд — здоровое видео не трогаем', () => {
    const { video } = renderPlayer({
      paused: true,
      readyState: HTMLMediaElement.HAVE_METADATA,
    });

    fire(video, 'stalled');
    advance(STALL_RELOAD_MS * 2);

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('suspend снимает ожидание: браузер сам остановил загрузку', () => {
    const { video } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    fire(video, 'suspend');
    advance(STALL_RELOAD_MS * 2);

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('данные пришли без события (readyState вырос) — по таймеру ничего не перезагружаем', () => {
    const { video, state } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    state.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
    advance(STALL_RELOAD_MS);

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('свежая загрузка тоже под присмотром: молчит 12 секунд — ещё одна перезагрузка', () => {
    const { video } = renderPlayer(PLAYING);

    fire(video, 'error');
    advance(STALL_RELOAD_MS);

    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it('loadedmetadata снимает присмотр за свежей загрузкой', async () => {
    const { video, state } = renderPlayer({ ...PLAYING, paused: true });

    fire(video, 'error');
    state.readyState = HTMLMediaElement.HAVE_METADATA;
    await fireLoadedMetadata(video);
    advance(STALL_RELOAD_MS * 2);

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('видео — приложение в фоне', () => {
  it('error в фоне не качает заново, при возвращении — load()', () => {
    const { video } = renderPlayer(PLAYING);

    hidden = true;
    fire(video, 'error');
    expect(loadSpy).not.toHaveBeenCalled();

    setHidden(false);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('таймер тишины сработал в фоне — перезагрузка при возвращении', () => {
    const { video } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    hidden = true;
    advance(STALL_RELOAD_MS);
    expect(loadSpy).not.toHaveBeenCalled();

    setHidden(false);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('вернулись в приложение, на элементе висит ошибка — load()', () => {
    const { state } = renderPlayer(PLAYING);

    state.error = NETWORK_ERROR;
    setHidden(false);

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('вернулись в приложение, видео здорово — ничего не перезагружаем', () => {
    renderPlayer(PLAYING);

    setHidden(false);

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('уход в фон сам по себе видео не трогает', () => {
    const { state } = renderPlayer(PLAYING);

    state.error = NETWORK_ERROR;
    setHidden(true);

    expect(loadSpy).not.toHaveBeenCalled();
  });
});

describe('видео — плашка «Загрузить снова»', () => {
  it('после трёх перезагрузок подряд показывает плашку, кнопка грузит заново', () => {
    const { video } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS + 1);
    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS);
    expect(screen.getByRole('status')).toHaveTextContent(DROPPED_TEXT);
    expect(screen.getByText('с того же места').tagName).toBe('STRONG');

    fireEvent.click(screen.getByRole('button', { name: RETRY_NAME }));
    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS + 1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('после кнопки попытки даются заново', () => {
    const { video } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS + 1);
    fireEvent.click(screen.getByRole('button', { name: RETRY_NAME }));
    fire(video, 'error');

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS + 2);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('progress между ошибками возвращает попытки', () => {
    const { video } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS);
    fire(video, 'progress');
    fire(video, 'error');

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS + 1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('тишина без данных тоже тратит попытки и кончается плашкой', () => {
    const { video } = renderPlayer(PLAYING);

    fire(video, 'error');
    advance(STALL_RELOAD_MS * MAX_AUTO_RELOADS);

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS);
    expect(screen.getByRole('status')).toHaveTextContent(DROPPED_TEXT);
  });

  it('связь вернулась (online) при плашке — load() и плашка исчезает', () => {
    const { video } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS + 1);
    fire(window, 'online');

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS + 1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('вернулись в приложение при плашке — load() и плашка исчезает', () => {
    const { video } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS + 1);
    setHidden(false);

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS + 1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('online при здоровом видео — ничего не перезагружаем', () => {
    renderPlayer(PLAYING);

    fire(window, 'online');

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('online при ошибке на элементе — load()', () => {
    const { state } = renderPlayer(PLAYING);

    state.error = NETWORK_ERROR;
    fire(window, 'online');

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('миниатюра в 96px: на плашке только «Загрузить снова», без текста и без «Скачать»', () => {
    const { video } = renderPlayer(PLAYING, 'thumb');

    failTimes(video, MAX_AUTO_RELOADS + 1);

    expect(screen.getByRole('button', { name: RETRY_NAME })).toBeInTheDocument();
    expect(screen.queryByText(DROPPED_TEXT)).toBeNull();
    expect(screen.queryByRole('link', { name: DOWNLOAD_NAME })).toBeNull();
  });

  it('плитка (160px): обе кнопки без текста — вместе с ним они не влезают', () => {
    const { video } = renderPlayer(PLAYING, 'tile');

    failTimes(video, MAX_AUTO_RELOADS + 1);

    expect(screen.getByRole('button', { name: RETRY_NAME })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: DOWNLOAD_NAME })).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent(DROPPED_TEXT);
  });

  it('другое видео в том же плеере начинает с чистого листа', () => {
    const { video, rerender } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS + 1);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<ExamVideoPlayer videoId="vid2" title="Вопрос" />);
    expect(screen.queryByRole('status')).toBeNull();

    fire(video, 'error');
    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS + 1);
  });
});

describe('видео — размонтирование', () => {
  it('после размонтирования события и таймер перезагрузку не запускают', () => {
    const { video, unmount } = renderPlayer({
      ...PLAYING,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    fire(video, 'waiting');
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);

    advance(STALL_RELOAD_MS * 2);
    fire(video, 'error');
    fire(video, 'waiting');
    fire(window, 'online');
    setHidden(false);

    expect(loadSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('видео — формат не открывается (ADR-0165)', () => {
  it('первая «не поддерживается» без метаданных — одна перезагрузка, вердикта ещё нет', () => {
    const { video, state } = renderPlayer(PLAYING);

    failWith(video, state, UNSUPPORTED_ERROR);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('вторая такая же — плашка «браузер не открывает», перезагрузок больше нет', () => {
    const { video, state } = renderPlayer(PLAYING);

    failAsUnsupported(video, state);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(UNSUPPORTED_TEXT);
    expect(screen.getByText('в плеере телефона или компьютера').tagName).toBe('STRONG');
    expect(status).not.toHaveTextContent(DROPPED_TEXT);
    expect(screen.queryByRole('button', { name: RETRY_NAME })).toBeNull();
    expect(screen.getByRole('link', { name: DOWNLOAD_NAME })).toBeInTheDocument();
  });

  it('после вердикта ни online, ни возвращение в приложение, ни тишина, ни новая ошибка не качают заново', () => {
    const { video, state } = renderPlayer(PLAYING);
    failAsUnsupported(video, state);

    fire(window, 'online');
    setHidden(false);
    fire(video, 'waiting');
    advance(STALL_RELOAD_MS * 2);
    failWith(video, state, UNSUPPORTED_ERROR);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(UNSUPPORTED_TEXT);
  });

  it('метаданные уже были — «не поддерживается» остаётся обрывом: три перезагрузки и «Загрузить снова»', async () => {
    const { video, state } = renderPlayer(PLAYING);
    await fireLoadedMetadata(video);

    for (let i = 0; i < MAX_AUTO_RELOADS + 1; i += 1) {
      failWith(video, state, UNSUPPORTED_ERROR);
    }

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS);
    expect(screen.getByRole('status')).toHaveTextContent(DROPPED_TEXT);
    expect(screen.getByRole('button', { name: RETRY_NAME })).toBeInTheDocument();
  });

  it('между двумя «не поддерживается» была ошибка сети — подряд не вышло, вердикта нет', () => {
    const { video, state } = renderPlayer(PLAYING);

    failWith(video, state, UNSUPPORTED_ERROR);
    failWith(video, state, NETWORK_ERROR);
    failWith(video, state, UNSUPPORTED_ERROR);

    expect(loadSpy).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('связи нет (navigator.onLine === false) — это обрыв, а не формат: плашка про связь', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { video, state } = renderPlayer(PLAYING);

    for (let i = 0; i < MAX_AUTO_RELOADS + 1; i += 1) {
      failWith(video, state, UNSUPPORTED_ERROR);
    }

    expect(loadSpy).toHaveBeenCalledTimes(MAX_AUTO_RELOADS);
    expect(screen.getByRole('status')).toHaveTextContent(DROPPED_TEXT);
  });

  it('первая ошибка пришла в фоне: перезагрузка при возвращении, вторая такая же — вердикт', () => {
    const { video, state } = renderPlayer(PLAYING);

    hidden = true;
    failWith(video, state, UNSUPPORTED_ERROR);
    expect(loadSpy).not.toHaveBeenCalled();

    setHidden(false);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    failWith(video, state, UNSUPPORTED_ERROR);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(UNSUPPORTED_TEXT);
  });

  it('другое видео в том же плеере начинает с чистого листа: вердикт снят, одна перезагрузка снова', () => {
    const { video, state, rerender } = renderPlayer(PLAYING);
    failAsUnsupported(video, state);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<ExamVideoPlayer videoId="vid2" title="Вопрос" />);
    expect(screen.queryByRole('status')).toBeNull();

    failWith(video, state, UNSUPPORTED_ERROR);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('миниатюра в 96px: только «Скачать», без текста и без «Загрузить снова»', () => {
    const { video, state } = renderPlayer(PLAYING, 'thumb');

    failAsUnsupported(video, state);

    expect(screen.getByRole('link', { name: DOWNLOAD_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RETRY_NAME })).toBeNull();
    expect(screen.queryByText(UNSUPPORTED_TEXT)).toBeNull();
    expect(screen.queryByText(UNSUPPORTED_TILE_TEXT)).toBeNull();
  });

  it('плитка (160px): короткий текст и «Скачать»', () => {
    const { video, state } = renderPlayer(PLAYING, 'tile');

    failAsUnsupported(video, state);

    expect(screen.getByRole('status')).toHaveTextContent(UNSUPPORTED_TILE_TEXT);
    expect(screen.getByRole('link', { name: DOWNLOAD_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RETRY_NAME })).toBeNull();
  });
});

describe('видео — «Скачать» (ADR-0165)', () => {
  it('обрыв: рядом с «Загрузить снова» обычная ссылка на ?download=1 видео вопроса', () => {
    const { video } = renderPlayer(PLAYING);

    failTimes(video, MAX_AUTO_RELOADS + 1);

    expect(screen.getByRole('button', { name: RETRY_NAME })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: DOWNLOAD_NAME });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/api/exam-videos/vid1?download=1');
    // Файл сохраняет заголовок attachment у подписанной ссылки; атрибут
    // `download` у ссылки с редиректом на другой домен браузер игнорирует.
    expect(link).not.toHaveAttribute('target');
  });

  it('у видео-ответа ссылка ведёт на /api/answer-videos/:id?download=1', () => {
    const { video } = renderPlayer(PLAYING, 'full', { answerVideoId: 'ans1' });

    failTimes(video, MAX_AUTO_RELOADS + 1);

    expect(screen.getByRole('link', { name: DOWNLOAD_NAME })).toHaveAttribute(
      'href',
      '/api/answer-videos/ans1?download=1',
    );
  });

  it('при неподдерживаемом формате ссылка та же', () => {
    const { video, state } = renderPlayer(PLAYING, 'full', { answerVideoId: 'ans1' });

    failAsUnsupported(video, state);

    expect(screen.getByRole('link', { name: DOWNLOAD_NAME })).toHaveAttribute(
      'href',
      '/api/answer-videos/ans1?download=1',
    );
  });

  it('здоровое видео ссылки не показывает', () => {
    renderPlayer(PLAYING);

    expect(screen.queryByRole('link', { name: DOWNLOAD_NAME })).toBeNull();
  });
});
