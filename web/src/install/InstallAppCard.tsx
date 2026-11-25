// Карточка «поставьте кабинет на телефон» в оболочке (docs/PWA.md) — под
// NewVersionBanner.tsx, тот же силуэт строки на тёплой плашке; решение
// «показывать ли» целиком здесь, AppShell.tsx его не знает (CLAUDE.md
// «Логика вне компонентов»). Не рисуется: на компьютере, если кабинет уже
// стоит (shouldOfferInstall), на самом экране «/install» и после «Не
// сейчас» (localStorage, только удобство устройства, не настройка
// профиля — installCardDismissal.ts).
//
// «Как поставить» открывает окно с роликом под браузер посетителя
// (InstallVideoDialog.tsx) — владелец, 2026-11-25: «сделай всплывающее
// аккуратное окно для тех, кто с телефона». Само окно не выскакивает: его
// открывает нажатие, карточку по-прежнему можно закрыть «Не сейчас»
// (CLAUDE.md «Ноль нагрузки на ученика»).
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { INSTALL_SCREEN_PATH } from './installPath';
import { useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { shellBannerStyle } from '../components/shellBannerStyle';
import { TextLinkButton } from '../components/TextLinkButton';
import { detectInstallBrowser, shouldOfferInstall } from '../pwa/installEnvironment';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { dismissInstallCard, isInstallCardDismissed } from './installCardDismissal';
import { InstallVideoDialog } from './InstallVideoDialog';

const CARD_TITLE = 'Поставьте кабинет на телефон';
const CARD_TEXT = 'Иконка на рабочем столе и уведомления, **даже когда кабинет закрыт**.';
const INSTALL_LABEL = 'Установить';
const HOW_TO_LABEL = 'Как поставить';
const DISMISS_LABEL = 'Не сейчас';

const textColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const titleStyle: CSSProperties = { margin: 0, fontWeight: 500 };
const textStyle: CSSProperties = { margin: 0 };
const actionsStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

export function InstallAppCard() {
  const { pathname } = useLocation();
  const { canPrompt, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(isInstallCardDismissed);
  const [videoOpen, setVideoOpen] = useState(false);

  if (dismissed) return null;
  if (pathname === INSTALL_SCREEN_PATH) return null;
  if (!shouldOfferInstall()) return null;
  // Карточка рисуется только на телефоне, а у телефона браузер для ролика
  // есть всегда; проверка ниже — для типа, не для поведения.
  const videoBrowser = detectInstallBrowser();

  function handleDismiss() {
    dismissInstallCard();
    setDismissed(true);
  }

  return (
    <aside aria-label={CARD_TITLE} style={shellBannerStyle}>
      <div style={textColumnStyle}>
        <p style={titleStyle}>{CARD_TITLE}</p>
        <p style={textStyle}>
          <RichText text={CARD_TEXT} />
        </p>
      </div>
      <div style={actionsStyle}>
        {canPrompt ? (
          <Button onClick={() => void promptInstall()}>{INSTALL_LABEL}</Button>
        ) : (
          <TextLinkButton onClick={() => setVideoOpen(true)}>
            {HOW_TO_LABEL}
          </TextLinkButton>
        )}
        <Button variant="secondary" onClick={handleDismiss}>
          {DISMISS_LABEL}
        </Button>
      </div>
      {videoOpen && videoBrowser && (
        <InstallVideoDialog browser={videoBrowser} onClose={() => setVideoOpen(false)} />
      )}
    </aside>
  );
}
