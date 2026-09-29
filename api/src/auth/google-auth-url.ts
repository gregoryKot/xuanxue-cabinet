// Адрес Google OAuth 2.0 (`accounts.google.com/o/oauth2/v2/auth`), на который
// GoogleAuthController.start() переводит вкладку (ADR-0145) — чистая функция,
// строит query через URLSearchParams (правильное экранирование, без ручной
// конкатенации).
import type { GoogleOAuthConfig } from './google-login-config';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_SCOPE = 'openid email profile';

export interface GoogleAuthUrlParams {
  state: string;
  nonce: string;
  challenge: string;
}

export function buildGoogleAuthUrl(
  config: GoogleOAuthConfig,
  { state, nonce, challenge }: GoogleAuthUrlParams,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Каждый вход выбирает аккаунт заново — молчаливый вход тем же Google-
    // аккаунтом, что был выбран год назад на общем компьютере, не годится
    // для входа в кабинет школы.
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}
