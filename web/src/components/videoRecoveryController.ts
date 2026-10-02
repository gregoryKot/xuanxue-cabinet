// Подписка на события `<video>`, которая перезагружает оборванную загрузку
// (зачем — в useVideoRecovery.ts). Без React: состояние живёт в замыкании
// подписки и пропадает с ней, смена `src` не тащит старую позицию в новое видео.
import {
  DISARM_EVENTS,
  MAX_AUTO_RELOADS,
  STALL_RELOAD_MS,
  isUnsupportedFormat,
  needsData,
  type VideoFailure,
} from './videoRecoveryRules';

type Listener = [event: string, handler: () => void];

export function attachVideoRecovery(
  video: HTMLVideoElement,
  onFailureChange: (failure: VideoFailure | null) => void,
): { retry: () => void; detach: () => void } {
  let failure: VideoFailure | null = null;
  // `resumeAt === null` — перезагрузка не идёт. Пока идёт, позицию не
  // перечитываем: у только что загруженного элемента `currentTime` равен 0.
  let resumeAt: number | null = null;
  let resumePlaying = false;
  let autoReloads = 0;
  let pendingWhileHidden = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  // Чем отличить «формат не открывается» от обрыва (videoRecoveryRules.ts).
  let lastErrorCode: number | null = null;
  let hasMetadata = false;

  const setFailure = (value: VideoFailure | null) => {
    failure = value;
    onFailureChange(value);
  };
  const disarm = () => {
    if (stallTimer === null) return;
    clearTimeout(stallTimer);
    stallTimer = null;
  };
  const arm = () => {
    disarm();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (needsData(video)) autoRecover();
    }, STALL_RELOAD_MS);
  };

  const reload = () => {
    if (resumeAt === null) {
      resumeAt = video.currentTime;
      resumePlaying = !video.paused;
    }
    video.load();
    // Свежая загрузка тоже «ждёт данные»: замолчит и она — таймер поймает.
    arm();
  };

  const autoRecover = () => {
    if (failure === 'unsupported') return; // перезагрузкой формат не вылечить
    // В фоне не качаем: мобильный трафик уйдёт впустую, а iOS всё равно
    // придушит. Вернёмся на `visibilitychange`.
    if (document.hidden) {
      pendingWhileHidden = true;
      return;
    }
    pendingWhileHidden = false;
    if (autoReloads >= MAX_AUTO_RELOADS) {
      disarm();
      setFailure('network');
      return;
    }
    autoReloads += 1;
    reload();
  };

  const onError = () => {
    const previousCode = lastErrorCode;
    lastErrorCode = video.error?.code ?? null;
    if (isUnsupportedFormat({ code: lastErrorCode, previousCode, hasMetadata })) {
      disarm();
      setFailure('unsupported');
      return;
    }
    autoRecover();
  };

  const retry = () => {
    autoReloads = 0;
    lastErrorCode = null;
    setFailure(null);
    reload();
  };

  const onLoadedMetadata = () => {
    hasMetadata = true;
    disarm();
    if (resumeAt === null) return;
    const position = resumeAt;
    const shouldPlay = resumePlaying;
    resumeAt = null;
    if (position > 0) video.currentTime = position;
    // Политика автовоспроизведения может отказать — тогда видео просто стоит
    // на нужной секунде, и человек жмёт «играть» сам. Через Promise.resolve
    // работает и там, где `play()` не возвращает промис.
    if (shouldPlay)
      void Promise.resolve()
        .then(() => video.play())
        .catch(() => undefined);
  };

  const onStall = () => {
    if (stallTimer === null && needsData(video)) arm();
  };

  const onProgress = () => {
    autoReloads = 0;
    if (stallTimer !== null) arm();
  };

  const onVisibilityChange = () => {
    if (document.hidden) return;
    if (failure === 'network') retry();
    else if (pendingWhileHidden || video.error) autoRecover();
  };

  const onOnline = () => {
    if (failure === 'network' || (failure === null && video.error)) retry();
  };

  const videoListeners: Listener[] = [
    ['error', onError],
    ['waiting', onStall],
    ['stalled', onStall],
    ['progress', onProgress],
    ['loadedmetadata', onLoadedMetadata],
    ...DISARM_EVENTS.map((name): Listener => [name, disarm]),
  ];
  videoListeners.forEach(([name, handler]) => video.addEventListener(name, handler));
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);

  const detach = () => {
    disarm();
    videoListeners.forEach(([name, handler]) => video.removeEventListener(name, handler));
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
  };

  return { retry, detach };
}
