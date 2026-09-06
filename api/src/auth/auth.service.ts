// Сессия (ADR-0012) — единственное место, где секрет уходит в signSession/
// verifySession. AuthGuard берёт токен и cookie только отсюда (issueSession,
// verifySession), а не читает SESSION_SECRET напрямую — одна точка ротации.
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { NodeEnv } from '../config/env.validation';
import { buildSessionCookie, clearSessionCookie } from './session-cookie';
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
  cookie: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(SESSION_SECRET) private readonly secret: string,
    private readonly config: ConfigService,
  ) {}

  /** Пока без прод-вызывающего кода (вход через Telegram добавит
   * /auth/telegram) — сюда же ляжет и Google/email-вход, если появятся
   * (ADR-0005). */
  issueSession(userId: string, now: DateTime): IssuedSession {
    const token = signSession({ userId, issuedAt: now }, this.secret);
    const cookie = buildSessionCookie(token, {
      secure: this.isSecure(),
      maxAgeSec: SESSION_MAX_AGE_SEC,
    });
    return { token, cookie };
  }

  verifySession(token: string, now: DateTime): SessionPayload | null {
    return verifySessionToken(token, this.secret, now);
  }

  logoutCookie(): string {
    return clearSessionCookie();
  }

  private isSecure(): boolean {
    return this.config.get<NodeEnv>('NODE_ENV') === 'production';
  }
}
