// Бюджет `GET /api/auth/native/me` (контракт Workshop native-content-session
// a07f087, «Capacity and identity»; ADR-0184). Бэкенд Daychi проверяет bearer
// читателя перед каждым защищённым чтением, и все его проверки приходят с
// одного IP: лимит по IP запер бы всех читателей разом. Поэтому ключ бюджета
// выбирается только после проверки bearer в базе: подтверждённый доступ
// считается по своему гранту (продлённый и прежний bearer — один грант), всё
// остальное — по IP. Ключа из непроверенного текста токена или заголовка нет:
// мусор с IP Daychi не съест бюджет ни одного читателя.
//
// Окно скользящее, а не фиксированное, как у ThrottlerGuard: контракт задаёт
// «60 успешных проверок за любые 60 секунд», Retry-After — до выхода самой
// старой из окна, на возрасте ровно 60 секунд она уже не считается, отказы
// окно не продлевают. Счётчики — в памяти процесса, как у ThrottlerGuard:
// сервис на Railway в одном экземпляре (ADR-0184).
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { NativeAuthError, NativeRateLimitedError } from './native-auth-error';
import type { NativeAuthentication } from './native-grants.service';

export const NATIVE_ME_LIMIT = 60;
export const NATIVE_ME_WINDOW_SEC = 60;
const MIN_RETRY_AFTER_SEC = 1;

type Outcome = { allowed: true } | { allowed: false; retryAfterSec: number };

/** Журнал засчитанных проверок по ключу. Отказ в журнал не пишется. */
export class SlidingWindowLog {
  private readonly log = new Map<string, DateTime[]>();
  private lastSweep: DateTime | null = null;

  constructor(
    private readonly limit: number,
    private readonly windowSec: number,
  ) {}

  consume(key: string, now: DateTime): Outcome {
    this.sweepIdle(now);
    const counted = this.liveEntries(key, now);
    const oldest = counted[0];
    if (counted.length >= this.limit && oldest) {
      const leavesInSec = this.windowSec - this.ageSec(oldest, now);
      return {
        allowed: false,
        retryAfterSec: Math.min(
          this.windowSec,
          Math.max(MIN_RETRY_AFTER_SEC, Math.ceil(leavesInSec)),
        ),
      };
    }
    counted.push(now);
    this.log.set(key, counted);
    return { allowed: true };
  }

  /** Сколько ключей держит журнал — для теста уборки. */
  size(): number {
    return this.log.size;
  }

  private ageSec(at: DateTime, now: DateTime): number {
    return now.diff(at).as('seconds');
  }

  private liveEntries(key: string, now: DateTime): DateTime[] {
    return (this.log.get(key) ?? []).filter(
      (at) => this.ageSec(at, now) < this.windowSec,
    );
  }

  // Ключ, к которому больше не обращаются, иначе жил бы вечно: раз в окно
  // журнал выбрасывает всех, чья последняя проверка уже вне окна.
  private sweepIdle(now: DateTime): void {
    if (this.lastSweep && this.ageSec(this.lastSweep, now) < this.windowSec) return;
    this.lastSweep = now;
    for (const [key, entries] of this.log) {
      const newest = entries[entries.length - 1];
      if (!newest || this.ageSec(newest, now) >= this.windowSec) this.log.delete(key);
    }
  }
}

@Injectable()
export class NativeMeLimiter {
  private readonly windows = new SlidingWindowLog(NATIVE_ME_LIMIT, NATIVE_ME_WINDOW_SEC);

  /** Проверяет bearer и только потом выбирает бюджет. Отказ проверки
   * (`NativeAuthError`: негодный bearer, заблокированный, лишний параметр)
   * считается по IP и сверх лимита становится 429; сбой базы и прочие
   * ошибки бюджет не трогают — это не трафик клиента, а наш отказ. */
  async admit(
    ip: string | undefined,
    now: DateTime,
    authenticate: () => Promise<NativeAuthentication>,
  ): Promise<NativeAuthentication> {
    let auth: NativeAuthentication;
    try {
      auth = await authenticate();
    } catch (error) {
      if (error instanceof NativeAuthError) this.charge(`ip:${ip ?? 'unknown'}`, now);
      throw error;
    }
    this.charge(`grant:${auth.grant._id.toString()}`, now);
    return auth;
  }

  private charge(key: string, now: DateTime): void {
    const outcome = this.windows.consume(key, now);
    if (!outcome.allowed) throw new NativeRateLimitedError(outcome.retryAfterSec);
  }
}
