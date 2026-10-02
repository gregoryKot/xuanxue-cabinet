// Правила, по которым videoRecoveryController.ts решает, что делать с видео,
// которое не играет, — отдельно от подписки на события, чистыми функциями.

/** Элемент ждёт данные, а `progress` не приходит столько времени — загрузчик
 * мёртв. Живая, но слабая связь шлёт `progress` каждые ~350 мс (HTML spec),
 * её таймер не трогает: перезагрузка срабатывает только на настоящей тишине. */
export const STALL_RELOAD_MS = 12_000;

/** Сколько раз подряд перезагружаем сами, пока между попытками не пришло ни
 * байта. Телефон без сети или файл, который не играет, не должны крутиться
 * вечно и жечь трафик: после трёх попыток показываем кнопку. */
export const MAX_AUTO_RELOADS = 3;

/** Два разных отказа и два разных ответа на них (ADR-0165, «Плеер»):
 * `network` — связь оборвалась, поможет «Загрузить снова»; `unsupported` —
 * браузер не умеет декодировать файл (iPhone HEVC в Firefox, часть Windows),
 * перезагрузка бесполезна, поможет только «Скачать». */
export type VideoFailure = 'network' | 'unsupported';

/** `MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED` по спецификации HTML. Числом, а не
 * `MediaError.…`: в тестовой среде (jsdom) такого глобала нет. */
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** После этих событий ждать данные не нужно: они есть (`playing`, `canplay`)
 * либо браузер сам остановил загрузку (`pause`, `suspend`). Без `suspend`
 * здоровое видео на паузе — он приходит после метаданных при
 * `preload="metadata"` — перезагружалось бы каждые 12 секунд до «ошибки». */
export const DISARM_EVENTS = ['playing', 'pause', 'canplay', 'suspend'] as const;

/** Данные нужны, если нет даже метаданных, либо видео играет, а впереди пусто.
 * Стадии берём константами HTMLMediaElement, а не числами: видно, о чём речь. */
export function needsData(video: HTMLVideoElement): boolean {
  return (
    video.readyState < HTMLMediaElement.HAVE_METADATA ||
    (!video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
  );
}

interface ErrorFacts {
  /** Код текущей ошибки элемента (`video.error?.code`), если он есть. */
  code: number | null;
  /** Код предыдущей ошибки этого же источника — после одной перезагрузки. */
  previousCode: number | null;
  /** Хоть раз за жизнь этого источника пришли метаданные. */
  hasMetadata: boolean;
  /** По умолчанию `navigator.onLine`: Chrome на недоступной сети тоже отвечает
   * «формат не поддерживается», и вердикт «браузер не открывает» без связи был
   * бы ложью. */
  isOnline?: boolean;
}

/** Формат не открывается, а не связь оборвалась: «не поддерживается» без единых
 * метаданных, дважды подряд (первый раз могла протухнуть ссылка — её чинит одна
 * перезагрузка), и сеть при этом есть. */
export function isUnsupportedFormat({
  code,
  previousCode,
  hasMetadata,
  isOnline = navigator.onLine,
}: ErrorFacts): boolean {
  return (
    code === MEDIA_ERR_SRC_NOT_SUPPORTED &&
    previousCode === MEDIA_ERR_SRC_NOT_SUPPORTED &&
    !hasMetadata &&
    isOnline
  );
}
