// Способы входа после Telegram — Google и почта, оба за своим флагом
// конфигурации: одно место условия вместо повтора
// `config?.googleLoginEnabled` / `config?.emailLoginEnabled` в LoginScreen.tsx
// и JoinScreen.tsx (CLAUDE.md «Одна механика — один компонент»). Google выше
// разделителя «или по почте» — второй путь входа кнопкой, а не полем формы,
// ближе по весу к Telegram.
import type { AuthConfigDto } from '@xuanxue/shared';
import { LabeledDivider } from '../components/LabeledDivider';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { EmailLoginForm } from './EmailLoginForm';
import { GoogleLoginButton } from './GoogleLoginButton';

// Над полем почты на странице входа — для кого эта форма (отзыв владельца
// 2026-11-06: «человек, вводя имейл, думает, что он так регистрируется»).
// Письмо с кодом уходит на любой адрес (SECURITY §2), и о том, что
// регистрации по почте нет, ученица 2026-11-06 узнала только после кода.
// Тихой строки «Первый вход — только по ссылке от учителя» наверху экрана
// (LoginScreen.tsx) для этого не хватило: она стоит над Telegram, а решение
// «ввести почту» принимается здесь. На странице приглашения (JoinScreen.tsx,
// inviteCode есть) подсказка не нужна — там регистрация и происходит.
const EXISTING_ONLY_MESSAGE =
  'По почте входят те, кто уже в кабинете. Первый раз — только по ' +
  'ссылке-приглашению от **учителя школы**: без неё код из письма не впустит.';

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
          {!inviteCode && (
            <p style={screenExplanationStyle}>
              <RichText text={EXISTING_ONLY_MESSAGE} />
            </p>
          )}
          <EmailLoginForm inviteCode={inviteCode} />
        </>
      )}
    </>
  );
}
