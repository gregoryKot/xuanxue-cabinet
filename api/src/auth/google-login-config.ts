// Проверка «Google-вход доступен конфигурацией» (ADR-0145) — три переменные
// разом (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL) нужны и
// GoogleAuthController (start/`redirect_uri`), и GET /auth/config (кнопка на
// экране входа) — один метод на оба места (CLAUDE.md «Дубли»), тот же приём,
// что у emailLoginPublicUrl (email-login-config.ts).
import type { ConfigService } from '@nestjs/config';
import { GOOGLE_LOGIN_CALLBACK_PATH } from '@xuanxue/shared';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Адрес самого кабинета — отдельно от `redirectUri` (не просто префикс:
   * читать его обратно из строки с хвостом было бы хрупко), нужен
   * GoogleAuthService.start() для `intent=link` без сессии — отправить
   * вкладку на `${publicUrl}/login`, не на Google вовсе. */
  publicUrl: string;
}

/** `null`, если хоть одной из трёх переменных нет — вызывающий код сам решает,
 * какой ошибкой на это ответить (NotAvailableError с разным текстом у start
 * и у пустого `googleLoginEnabled`). */
export function googleOAuthConfig(config: ConfigService): GoogleOAuthConfig | null {
  const clientId = config.get<string>('GOOGLE_CLIENT_ID');
  const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
  const publicUrl = config.get<string>('PUBLIC_URL');
  if (!clientId || !clientSecret || !publicUrl) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${publicUrl}${GOOGLE_LOGIN_CALLBACK_PATH}`,
    publicUrl,
  };
}
