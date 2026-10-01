// Подписка на события `<video>`, которая перезагружает оборванную загрузку
// (зачем — в useVideoRecovery.ts). Без React: состояние живёт в замыкании
// подписки и пропадает с ней, смена `src` не тащит старую позицию в новое видео.

/** Элемент ждёт данные, а `progress` не приходит столько времени — загрузчик
 * мёртв. Живая, но слабая связь шлёт `progress` каждые ~350 мс (HTML spec),
 * её таймер не трогает: перезагрузка срабатывает только на настоящей тишине. */
export const STALL_RELOAD_MS = 12_000;

/** Сколько раз подряд перезагружаем сами, пока между попытками не пришло ни
 * байта. Телефон без сети или файл, который не играет, не должны крутиться
 * вечно и жечь трафик: после трёх попыток показываем кнопку. */
export const MAX_AUTO_RELOADS = 3;

/** После этих событий ждать данные не нужно: они есть (`playing`, `canplay`)
 * либо браузер сам остановил загрузку (`pause`, `suspend`). Без `suspend`
 * здоровое видео на паузе — он приходит после метаданных при
 * `preload="metadata"` — перезагружалось бы каждые 12 секунд до «ошибки». */
const DISARM_EVENTS = ['playing', 'pause', 'canplay', 'suspend'] as const;

/** Данные нужны, если нет даже метаданных, либо видео играет, а впереди пусто.
 * Стадии берём константами HTMLMediaElement, а не числами: видно, о чём речь. */
function needsData(video: HTMLVideoElement): boolean {
  return (
    video.readyState < HTMLMediaElement.HAVE_METADATA ||
    (!video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
  );
}

type Listener = [event: string, handler: () => void];

export function attachVideoRecovery(
  video: HTMLVideoElement,
  onFailedChange: (failed: boolean) => void,
): { retry: () => void; detach: () => void } {
  let failed = false;
  // `resumeAt === null` — перезагрузка не идёт. Пока идёт, позицию не
  // перечитываем: у только что загруженного элемента `currentTime` равен 0.
  let resumeAt: number | null = null;
  let resumePlaying = false;
  let autoReloads = 0;
  let pendingWhileHidden = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const setFailed = (value: boolean) => {
    failed = value;
    onFailedChange(value);
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
    // В фоне не качаем: мобильный трафик уйдёт впустую, а iOS всё равно
    // придушит. Вернёмся на `visibilitychange`.
    if (document.hidden) {
      pendingWhileHidden = true;
      return;
    }
    pendingWhileHidden = false;
    if (autoReloads >= MAX_AUTO_RELOADS) {
      disarm();
      setFailed(true);
      return;
    }
    autoReloads += 1;
    reload();
  };

  const retry = () => {
    autoReloads = 0;
    setFailed(false);
    reload();
  };

  const onLoadedMetadata = () => {
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
    if (failed) retry();
    else if (pendingWhileHidden || video.error) autoRecover();
  };

  const onOnline = () => {
    if (failed || video.error) retry();
  };

  const videoListeners: Listener[] = [
    ['error', autoRecover],
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
