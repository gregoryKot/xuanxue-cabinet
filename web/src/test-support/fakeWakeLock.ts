// Фейковый Screen Wake Lock (video-upload/useScreenWakeLock.ts): jsdom его не
// даёт. Блокировка — объект с `released` и событием `release`, как у настоящей;
// `hide()` повторяет поведение браузера, когда страница уходит в фон: он сам
// снимает блокировку и шлёт `visibilitychange`.
import { afterEach, vi } from 'vitest';

class FakeWakeLockSentinel extends EventTarget {
  released = false;

  constructor(private readonly releaseError?: Error) {
    super();
  }

  release(): Promise<void> {
    if (!this.released) {
      this.released = true;
      this.dispatchEvent(new Event('release'));
    }
    return this.releaseError ? Promise.reject(this.releaseError) : Promise.resolve();
  }
}

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(value: DocumentVisibilityState): void {
  visibility = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

export interface FakeWakeLock {
  request: ReturnType<typeof vi.fn<(type: 'screen') => Promise<FakeWakeLockSentinel>>>;
  /** Все выданные блокировки по порядку. */
  sentinels: FakeWakeLockSentinel[];
  /** Страница ушла в фон: браузер снимает блокировки сам. */
  hide: () => void;
  show: () => void;
}

interface FakeWakeLockOptions {
  /** Запрос отказывает (экономия батареи). */
  requestError?: Error;
  /** Снятие блокировки отказывает (браузер уже снял её сам). */
  releaseError?: Error;
}

/** Ставит фейк на `navigator.wakeLock` и видимость «видна»; снимается после
 * каждого теста. */
export function installFakeWakeLock(options: FakeWakeLockOptions = {}): FakeWakeLock {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  const sentinels: FakeWakeLockSentinel[] = [];
  const request = vi.fn((_type: 'screen') => {
    if (options.requestError) return Promise.reject(options.requestError);
    const sentinel = new FakeWakeLockSentinel(options.releaseError);
    sentinels.push(sentinel);
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
  return {
    request,
    sentinels,
    hide: () => {
      sentinels.forEach((sentinel) => void sentinel.release());
      setVisibility('hidden');
    },
    show: () => setVisibility('visible'),
  };
}

/** Зовётся на уровне файла теста: убирает фейк после каждого теста. */
export function removeFakeWakeLockAfterEach(): void {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(document, 'visibilityState');
  });
}
