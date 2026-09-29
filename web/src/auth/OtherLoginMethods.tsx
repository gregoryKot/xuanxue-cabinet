// Способы входа после Telegram — Google и почта, оба за своим флагом
// конфигурации: одно место условия вместо повтора
// `config?.googleLoginEnabled` / `config?.emailLoginEnabled` в LoginScreen.tsx
// и JoinScreen.tsx (CLAUDE.md «Одна механика — один компонент»). Google выше
// разделителя «или по почте» — второй путь входа кнопкой, а не полем формы,
// ближе по весу к Telegram.
import type { AuthConfigDto } from '@xuanxue/shared';
import { LabeledDivider } from '../components/LabeledDivider';
import { EmailLoginForm } from './EmailLoginForm';
import { GoogleLoginButton } from './GoogleLoginButton';

interface OtherLoginMethodsProps {
  config: AuthConfigDto | null;
  configStatus: 'loading' | 'ok' | 'offline';
  /** Код ссылки-приглашения (ADR-0030/0036) — JoinScreen.tsx передаёт код
   * из /join/:code, LoginScreen.tsx не передаёт вовсе. */
  inviteCode?: string;
}

export function OtherLoginMethods({
  config,
  configStatus,
  inviteCode,
}: OtherLoginMethodsProps) {
  // configStatus !== 'ok' — до ответа /auth/config или при сбое сети нечего
  // показывать: настроен ли Google/почта, ещё неизвестно (та же оговорка,
  // что у кнопки Telegram выше, TelegramLoginSection.tsx).
  if (configStatus !== 'ok') return null;

  return (
    <>
      {config?.googleLoginEnabled && <GoogleLoginButton inviteCode={inviteCode} />}
      {config?.emailLoginEnabled && (
        <>
          <LabeledDivider label="или по почте" />
          <EmailLoginForm inviteCode={inviteCode} />
        </>
      )}
    </>
  );
}
