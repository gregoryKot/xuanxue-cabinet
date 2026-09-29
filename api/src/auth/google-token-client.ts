// Обмен authorization code на id_token у Google (ADR-0145,
// oauth2.googleapis.com/token) — единственное место, где api ходит в сеть к
// Google. Отдельный injectable-класс, не метод в GoogleAuthService: e2e
// подменяет его фейком, возвращающим самодельный id_token с тестовыми
// claims — реальный Google в CI недоступен (google-auth.e2e-spec.ts).
import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../common/error-info';
import type { GoogleOAuthConfig } from './google-login-config';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// Сеть, которая не рвётся, а молчит, иначе держит запрос до таймаута
// платформы (CLAUDE.md, check-outbound-timeout.mjs).
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

export interface GoogleTokenExchangeParams {
  code: string;
  verifier: string;
  config: GoogleOAuthConfig;
}

@Injectable()
export class GoogleTokenClient {
  private readonly logger = new Logger(GoogleTokenClient.name);

  /** `null` — Google отказал в обмене или ответ не тот, что ожидался; вызывающий
   * код (GoogleAuthService) отвечает одним GOOGLE_LOGIN_FAILED_MESSAGE, здесь
   * только лог с причиной (SECURITY §2: тело ответа и код в лог не идут — там
   * может быть эхо client_secret/code). */
  async exchange({
    code,
    verifier,
    config,
  }: GoogleTokenExchangeParams): Promise<string | null> {
    const body = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Google token endpoint недоступен: ${errorMessage(err)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.error(`Google token endpoint ответил ${response.status}`);
      return null;
    }

    const payload = (await response.json().catch(() => null)) as {
      id_token?: unknown;
    } | null;
    if (!payload || typeof payload.id_token !== 'string') {
      this.logger.error('Google token endpoint не вернул id_token');
      return null;
    }
    return payload.id_token;
  }
}
