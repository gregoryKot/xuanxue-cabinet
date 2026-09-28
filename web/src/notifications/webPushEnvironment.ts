// Возможности браузера для push (ADR-0092, PR №5) — чистые функции без
// побочных эффектов, отдельно от usePushSubscription.ts: тесты подменяют
// глобальные navigator/window через vi.stubGlobal и не трогают ни хук, ни
// сеть (CLAUDE.md «тестируется без DOM?»).
//
// `isIPhone`/`isStandalone` — из pwa/installEnvironment.ts: тот же признак
// нужен подсказке установки на телефон (pwa/InstallAppScreen.tsx), второй
// литерал ловит jscpd (CLAUDE.md «Одна механика — один компонент»).
import { isIPhone, isStandalone } from '../pwa/installEnvironment';

/**
 * `serviceWorker` и `PushManager` — минимум, без которого push невозможен.
 * `Notification` проверяем отдельно: без него негде читать `.permission`
 * (pushSectionState.ts) — на практике он есть у любого браузера с
 * PushManager, проверка здесь только страховка от ReferenceError.
 */
export function isPushBrowserSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/** iPhone/iPod, кабинет не поставлен на экран «Домой» — Safari 16.4+ отдаёт
 * push только установленному приложению, разрешение спросить нельзя
 * (ADR-0092, RUNBOOK §6.5). Кнопка «Включить уведомления» в этом случае
 * ничего не сделает — раздел обязан объяснить это, а не звать в пустоту. */
export function iosNeedsHomeScreenInstall(): boolean {
  return isIPhone() && !isStandalone();
}
