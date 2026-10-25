// Сессия (ADR-0012) — единственное место, где секрет уходит в signSession/
// verifySession, а профиль окружения (ADR-0183) — в имя и атрибуты cookie.
// AuthGuard, троттлер, предикаты сырых загрузок, findSessionUser и вход из wiki
// читают сессию только отсюда (readSession, verifyCookieHeader), а не разбирают
// cookie сами — одна точка ротации секрета и одно правило «ровно одна cookie
// своего имени».
import { Injectable, Inject } from '@nestjs/common';
import type { DateTime } from 'luxon';
import {
  browserLogoutCookies,
  browserSessionCookies,
  buildSessionCookie,
  readSessionToken,
  SESSION_PROFILE,
  type SessionCookieProfile,
} from './session-cookie';
import { shouldRenew } from './session-renewal';
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

/** Токен вместе с проверенной нагрузкой: вход из wiki отдаёт браузеру тот же
 * токен, а не выпускает новый. */
interface VerifiedSession {
  token: string;
  payload: SessionPayload;
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

  /** Одно поле `Set-Cookie` свежей сессии — только действующая cookie профиля,
   * без уборки прежней host-only `session` (маршрут проверки для бэкенда Daychi). */
  activeSessionCookie(userId: string, now: DateTime): string {
    const token = signSession({ userId, issuedAt: now }, this.secret);
    return buildSessionCookie(token, this.profile, SESSION_MAX_AGE_SEC);
  }

  /** Токен и нагрузка из заголовка `Cookie:` — `null`, если cookie профиля нет,
   * их больше одной или токен не прошёл подпись/срок. */
  readSession(header: string | undefined, now: DateTime): VerifiedSession | null {
    const token = readSessionToken(header, this.profile);
    if (!token) return null;
    const payload = verifySessionToken(token, this.secret, now);
    return payload ? { token, payload } : null;
  }

  verifyCookieHeader(header: string | undefined, now: DateTime): SessionPayload | null {
    return this.readSession(header, now)?.payload ?? null;
  }

  /** Поля `Set-Cookie` для переноса действующей сессии на общую cookie профиля.
   * Тот же токен и его остаток срока: вход из wiki не начинает новые 90 дней.
   * Токен старше порога rolling-продления заменяется свежим, как в гварде. */
  sharedSessionCookies(session: VerifiedSession, now: DateTime): string[] {
    const { token, payload } = session;
    if (shouldRenew(payload, now)) return this.issueSession(payload.sub, now).cookies;
    const remainingSec = payload.exp - Math.floor(now.toSeconds());
    return browserSessionCookies(token, this.profile, remainingSec);
  }

  /** Origin wiki этого окружения, `null` — wiki нет (локальный профиль). */
  wikiOrigin(): string | null {
    return this.profile.wikiOrigin;
  }

  logoutCookies(): string[] {
    return browserLogoutCookies(this.profile);
  }
}
