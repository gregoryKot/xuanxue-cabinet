// Экран «Приложение на телефоне» (docs/PWA.md) — как поставить кабинет на
// экран «Домой»: своя инструкция для iPhone (только шаги руками — Safari не
// даёт установить программно) и для Android (кнопка через
// `beforeinstallprompt`, pwa/useInstallPrompt.ts, плюс те же шаги на случай,
// если кнопки нет). Открыт с телефона в браузере — карточка в оболочке
// (InstallAppCard.tsx) и «Профиль» ведут сюда; с компьютера — только адрес и
// обе инструкции, ставить на нём кабинету некуда.
import { Link } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { RichText } from '../components/RichText';
import {
  screenExplanationStyle,
  screenSectionStyle,
  textLinkHitAreaStyle,
} from '../components/screenLayout';
import { Button } from '../components/Button';
import { detectInstallPlatform, isStandalone } from '../pwa/installEnvironment';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { InstallSteps } from './InstallSteps';
import {
  ANDROID_HEADING,
  ANDROID_INSTALL_LABEL,
  ANDROID_MANUAL_HEADING,
  ANDROID_PROMPT_HINT,
  ANDROID_STEPS,
  EXPLANATION,
  INSTALL_ALREADY,
  IOS_HEADING,
  IOS_RELOGIN,
  IOS_STEPS,
  NOTIFICATIONS_HINT,
  NOTIFICATIONS_PROFILE_LINK_LABEL,
  TITLE,
  desktopHint,
} from './installAppCopy';

const PROFILE_PATH = '/profile';

function NotificationsHint() {
  return (
    <>
      <p style={screenExplanationStyle}>
        <RichText text={NOTIFICATIONS_HINT} />
      </p>
      <Link to={PROFILE_PATH} style={textLinkHitAreaStyle}>
        {NOTIFICATIONS_PROFILE_LINK_LABEL}
      </Link>
    </>
  );
}

function IosInstructions() {
  return (
    <>
      <h2 className="xuanxue-eyebrow">{IOS_HEADING}</h2>
      <InstallSteps steps={IOS_STEPS} />
      <p style={screenExplanationStyle}>
        <RichText text={IOS_RELOGIN} />
      </p>
    </>
  );
}

function AndroidInstructions({ withPromptButton }: { withPromptButton: boolean }) {
  const { canPrompt, promptInstall } = useInstallPrompt();
  const showsButton = withPromptButton && canPrompt;

  return (
    <>
      <h2 className="xuanxue-eyebrow">{ANDROID_HEADING}</h2>
      {showsButton && (
        <>
          <Button onClick={() => void promptInstall()}>{ANDROID_INSTALL_LABEL}</Button>
          <p style={screenExplanationStyle}>
            <RichText text={ANDROID_PROMPT_HINT} />
          </p>
        </>
      )}
      {showsButton && <p style={screenExplanationStyle}>{ANDROID_MANUAL_HEADING}</p>}
      <InstallSteps steps={ANDROID_STEPS} />
    </>
  );
}

export default function InstallAppScreen() {
  const platform = detectInstallPlatform();
  const already = isStandalone();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={already ? undefined : EXPLANATION} />

      {already && (
        <>
          <p style={screenExplanationStyle}>{INSTALL_ALREADY}</p>
          <Link to={PROFILE_PATH} style={textLinkHitAreaStyle}>
            {NOTIFICATIONS_PROFILE_LINK_LABEL}
          </Link>
        </>
      )}

      {!already && platform === 'ios' && (
        <>
          <IosInstructions />
          <NotificationsHint />
        </>
      )}

      {!already && platform === 'android' && (
        <>
          <AndroidInstructions withPromptButton />
          <NotificationsHint />
        </>
      )}

      {!already && platform === 'desktop' && (
        <>
          <p style={screenExplanationStyle}>
            <RichText text={desktopHint(window.location.host)} />
          </p>
          <IosInstructions />
          <AndroidInstructions withPromptButton={false} />
        </>
      )}
    </section>
  );
}
