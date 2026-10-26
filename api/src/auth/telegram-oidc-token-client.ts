// Обмен authorization code на id_token у Telegram (ADR-0187,
// oauth.telegram.org/token) — единственное место, где api ходит в сеть к
// OIDC-входу Telegram. Отдельный injectable-класс, не метод в
// TelegramOidcService: e2e подменяет его фейком, возвращающим самодельный
// id_token (telegram-oidc.e2e-spec.ts) — реальный Telegram в CI недоступен.
// Сетевая часть (таймаут, разбор ответа, логи без тела и кода) —
// oauth-token-request.ts, общая с Google.
import { Injectable, Logger } from '@nestjs/common';
import { requestIdToken } from './oauth-token-request';
import type { TelegramOidcConfig } from './telegram-oidc-config';

const TOKEN_ENDPOINT = 'https://oauth.telegram.org/token';

export interface TelegramTokenExchangeParams {
  code: string;
  verifier: string;
  config: TelegramOidcConfig;
}

@Injectable()
export class TelegramOidcTokenClient {
  private readonly logger = new Logger(TelegramOidcTokenClient.name);

  /** `null` — Telegram отказал в обмене или ответ не тот, что ожидался;
   * TelegramOidcService отвечает одним TELEGRAM_LOGIN_FAILED_MESSAGE. В отличие
   * от Google, client_secret едет не в теле, а в `Authorization: Basic`
   * (client_id:client_secret) — так описан token endpoint Telegram. */
  exchange({
    code,
    verifier,
    config,
  }: TelegramTokenExchangeParams): Promise<string | null> {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: verifier,
    });
    return requestIdToken(this.logger, {
      provider: 'Telegram',
      endpoint: TOKEN_ENDPOINT,
      headers: { Authorization: `Basic ${credentials.toString('base64')}` },
      body,
    });
  }
}
