// Строка «сборка обновилась» над содержимым (ADR-0101): вкладку кабинета
// держат открытой неделями (ADR-0076), деплой уезжает по нескольку раз в
// день — appVersion.ts замечает смену версии в ответах API и поднимает флаг,
// здесь он превращается в подсказку с кнопкой перезагрузки.
//
// role="status", не role="alert": это не сбой (тот же довод, что у
// components/FormDraftNote.tsx) — скринридер объявит строку спокойно, не
// перебивая то, что человек уже читает.
import type { CSSProperties } from 'react';
import { useSyncExternalStore } from 'react';
import { Button } from '../components/Button';
import { shellBannerStyle } from '../components/shellBannerStyle';
import { hasNewAppVersion, subscribeToAppVersion } from '../api/appVersion';

const MESSAGE = 'Кабинет обновился — у вас открыта прежняя версия.';
const RELOAD_LABEL = 'Обновить страницу';

const messageStyle: CSSProperties = { margin: 0 };

// Перезагружает человек, не мы: на экране может быть недописанная форма
// (черновики форм переживают перезагрузку, ADR-0052, но решать всё равно ему,
// ADR-0101).
function reloadPage(): void {
  window.location.reload();
}

export function NewVersionBanner() {
  const hasNewVersion = useSyncExternalStore(subscribeToAppVersion, hasNewAppVersion);

  if (!hasNewVersion) return null;

  return (
    <div role="status" style={shellBannerStyle}>
      <p style={messageStyle}>{MESSAGE}</p>
      <Button variant="secondary" onClick={reloadPage}>
        {RELOAD_LABEL}
      </Button>
    </div>
  );
}
