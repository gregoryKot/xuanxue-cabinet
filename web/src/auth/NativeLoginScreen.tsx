// Экран входа для приложения Daychi (`/login/native?attempt=…`, ADR-0181,
// «Браузер»). Сюда сервер приводит браузер, когда Daychi просит вход, а сессии
// кабинета нет. До первого действия экран говорит, что это и что будет после
// входа (CLAUDE.md «Продукт»), дальше — те же способы входа, что у
// LoginScreen.tsx, теми же компонентами. Логика — useNativeLogin.ts.
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { RichText } from '../components/RichText';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { LegalLinks } from '../legal/LegalLink';
import { NATIVE_LOGIN_TITLE, NativeLeavingStatus } from './NativeLeavingStatus';
import { OtherLoginMethods } from './OtherLoginMethods';
import { TelegramLoginSection } from './TelegramLoginSection';
import { useAuthConfig } from './useAuthConfig';
import { useNativeLogin } from './useNativeLogin';

const PAGE_TITLE = 'Вход в Daychi';
const EXPLANATION = 'Войдите в кабинет школы, и приложение Daychi **откроется само**.';
const RESTART_MESSAGE = 'Вернитесь в приложение Daychi и начните вход заново.';
const RETURN_LABEL = 'Вернуться в приложение';

const fullWidthStyle: CSSProperties = { width: '100%' };

export default function NativeLoginScreen() {
  useDocumentTitle(PAGE_TITLE);
  const { view, returnToApp } = useNativeLogin();

  if (view === 'login') return <NativeLoginMethods onReturnToApp={returnToApp} />;
  if (view === 'leaving') return <NativeLeavingStatus />;

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{NATIVE_LOGIN_TITLE}</h1>
      <p role="alert" style={screenExplanationStyle}>
        {RESTART_MESSAGE}
      </p>
    </EntryColumn>
  );
}

// Отдельным компонентом: конфигурация входа нужна только гостю — тупику и
// уходящей вкладке звать /auth/config незачем.
function NativeLoginMethods({ onReturnToApp }: { onReturnToApp: () => void }) {
  const { config, status: configStatus, reload } = useAuthConfig();

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{NATIVE_LOGIN_TITLE}</h1>
      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>

      {/* navigateAfterLogin={false}, как у JoinScreen.tsx: Telegram
          возвращает вкладку сюда же, и дальше экран уходит в Daychi сам, как
          только появилась сессия (useNativeLogin.ts). */}
      <TelegramLoginSection
        config={config}
        configStatus={configStatus}
        onReload={reload}
        navigateAfterLogin={false}
      >
        <OtherLoginMethods config={config} configStatus={configStatus} />
      </TelegramLoginSection>

      {/* Контур, не заливка: запасной выход, главное действие — вход. */}
      <Button variant="secondary" onClick={onReturnToApp} style={fullWidthStyle}>
        {RETURN_LABEL}
      </Button>

      <LegalLinks />
    </EntryColumn>
  );
}
