// Обмен authorization code на id_token у Google (ADR-0145,
// oauth2.googleapis.com/token) — единственное место, где api ходит в сеть к
// Google. Отдельный injectable-класс, не метод в GoogleAuthService: e2e
// подменяет его фейком, возвращающим самодельный id_token с тестовыми
// claims — реальный Google в CI недоступен (google-auth.e2e-spec.ts).
// Сетевая часть (таймаут, разбор ответа) — oauth-token-request.ts, общая с Telegram.
import { Injectable, Logger } from '@nestjs/common';
import type { GoogleOAuthConfig } from './google-login-config';
import { requestIdToken } from './oauth-token-request';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleTokenExchangeParams {
  code: string;
  verifier: string;
  config: GoogleOAuthConfig;
}

@Injectable()
export class GoogleTokenClient {
  private readonly logger = new Logger(GoogleTokenClient.name);

  /** `null` — Google отказал в обмене или ответ не тот, что ожидался; вызывающий
   * код (GoogleAuthService) отвечает одним GOOGLE_LOGIN_FAILED_MESSAGE. */
  exchange({
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
    return requestIdToken(this.logger, {
      provider: 'Google',
      endpoint: TOKEN_ENDPOINT,
      body,
    });
  }
}
