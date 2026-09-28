// Карточка «поставьте кабинет на телефон» в оболочке (docs/PWA.md) — под
// NewVersionBanner.tsx, тот же силуэт строки на тёплой плашке; решение
// «показывать ли» целиком здесь, AppShell.tsx его не знает (CLAUDE.md
// «Логика вне компонентов»). Не рисуется: на компьютере, если кабинет уже
// стоит (shouldOfferInstall), на самом экране «/install» и после «Не
// сейчас» (localStorage, только удобство устройства, не настройка
// профиля — installCardDismissal.ts).
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { INSTALL_SCREEN_PATH } from './installPath';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { shellBannerStyle } from '../components/shellBannerStyle';
import { textLinkHitAreaStyle } from '../components/screenLayout';
import { shouldOfferInstall } from '../pwa/installEnvironment';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { dismissInstallCard, isInstallCardDismissed } from './installCardDismissal';

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

  if (dismissed) return null;
  if (pathname === INSTALL_SCREEN_PATH) return null;
  if (!shouldOfferInstall()) return null;

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
          <Link to={INSTALL_SCREEN_PATH} style={textLinkHitAreaStyle}>
            {HOW_TO_LABEL}
          </Link>
        )}
        <Button variant="secondary" onClick={handleDismiss}>
          {DISMISS_LABEL}
        </Button>
      </div>
    </aside>
  );
}
