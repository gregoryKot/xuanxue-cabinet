// Сессия (ADR-0012) — единственное место, где секрет уходит в signSession/
// verifySession, а профиль окружения (ADR-0183) — в имя и атрибуты cookie.
// AuthGuard, троттлер, предикаты сырых загрузок и findSessionUser читают
// сессию только отсюда (verifyCookieHeader), а не разбирают cookie сами —
// одна точка ротации секрета и одно правило «ровно одна cookie своего имени».
import { Injectable, Inject } from '@nestjs/common';
import type { DateTime } from 'luxon';
import {
  browserLogoutCookies,
  browserSessionCookies,
  readSessionToken,
  SESSION_PROFILE,
  type SessionCookieProfile,
} from './session-cookie';
import {
  SESSION_MAX_AGE_SEC,
  SESSION_SECRET,
  signSession,
  verifySession as verifySessionToken,
  type SessionPayload,
} from './session-token';

// Не экспортируется — используется только как тип возврата внутри этого
// файла, наружу берут поля, а не тип целиком (knip: неиспользуемый экспорт).
interface IssuedSession {
  token: string;
  /** Поля `Set-Cookie` целиком — `res.setHeader('Set-Cookie', cookies)`. */
  cookies: string[];
}

/** Чтение сессии без выпуска — всё, что нужно троттлеру и предикатам сырых
 * загрузок: чистые функции получают его параметром, а не секрет и имя cookie. */
export type SessionVerifier = Pick<AuthService, 'verifyCookieHeader'>;

@Injectable()
export class AuthService {
  constructor(
    @Inject(SESSION_SECRET) private readonly secret: string,
    @Inject(SESSION_PROFILE) private readonly profile: SessionCookieProfile,
  ) {}

  issueSession(userId: string, now: DateTime): IssuedSession {
    const token = signSession({ userId, issuedAt: now }, this.secret);
    return {
      token,
      cookies: browserSessionCookies(token, this.profile, SESSION_MAX_AGE_SEC),
    };
  }

  /** Сессия из заголовка `Cookie:` — `null`, если cookie профиля нет, их
   * больше одной или токен не прошёл подпись/срок. */
  verifyCookieHeader(header: string | undefined, now: DateTime): SessionPayload | null {
    const token = readSessionToken(header, this.profile);
    return token ? verifySessionToken(token, this.secret, now) : null;
  }

  logoutCookies(): string[] {
    return browserLogoutCookies(this.profile);
  }
}
