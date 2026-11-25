// Окно с роликом установки поверх экрана — открывается с карточки «Поставьте
// кабинет на телефон» (InstallAppCard.tsx): человек видит, что нажимать в его
// браузере, не уходя со страницы. Шаги текстом и подсказка про повторный вход
// на iPhone остаются на экране `/install` — ссылка на него здесь же.
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { DialogShell } from '../components/DialogShell';
import { textLinkHitAreaStyle } from '../components/screenLayout';
import type { InstallBrowser } from '../pwa/installEnvironment';
import { InstallVideo } from './InstallVideo';
import {
  VIDEO_DIALOG_CLOSE,
  VIDEO_DIALOG_STEPS_LINK,
  VIDEO_DIALOG_TITLE,
} from './installAppCopy';
import { INSTALL_SCREEN_PATH } from './installPath';

interface InstallVideoDialogProps {
  browser: InstallBrowser;
  onClose: () => void;
}

export function InstallVideoDialog({ browser, onClose }: InstallVideoDialogProps) {
  return (
    <DialogShell
      title={VIDEO_DIALOG_TITLE}
      onClose={onClose}
      renderActions={(close) => (
        <>
          {/* `replace`: ссылка занимает запись истории самого окна
              (useHistorySheet), поэтому «Назад» с экрана шагов возвращает на
              страницу, с которой окно открыли. `onClose` гасит состояние
              «окно открыто» у карточки: она переживает переход (на `/install`
              лишь не рисуется) и без этого открыла бы окно заново по
              возвращении. */}
          <Link
            to={INSTALL_SCREEN_PATH}
            replace
            onClick={onClose}
            style={textLinkHitAreaStyle}
          >
            {VIDEO_DIALOG_STEPS_LINK}
          </Link>
          <Button variant="secondary" onClick={close}>
            {VIDEO_DIALOG_CLOSE}
          </Button>
        </>
      )}
    >
      <InstallVideo browser={browser} compact />
    </DialogShell>
  );
}
