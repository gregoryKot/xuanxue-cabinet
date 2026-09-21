// Возможности браузера для push (ADR-0092, PR №5) — чистые функции без
// побочных эффектов, отдельно от usePushSubscription.ts: тесты подменяют
// глобальные navigator/window через vi.stubGlobal и не трогают ни хук, ни
// сеть (CLAUDE.md «тестируется без DOM?»).

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

/** Только userAgent — другого способа узнать iPhone у браузера нет
 * (комментарий-причина по прямой просьбе ТЗ ПР №5: способ выглядит хрупко,
 * но заменить нечем). Без iPad: docs/PWA.md и RUNBOOK §6.5 говорят об
 * iPhone — на iPad Safari с 2019 года по умолчанию выдаёт себя за
 * настольный (свой userAgent просит редко и непредсказуемо), надёжно
 * отличить его от Mac всё равно нельзя, а установленный кабинет на iPad не
 * обещан отдельно ни одним документом проекта. */
function isIPhone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

/** display-mode: standalone — современный признак установленного PWA;
 * navigator.standalone — то же самое у Safari старых версий, свойство вне
 * стандарта DOM, поэтому в лоб типами TypeScript его не знает. */
function isStandalone(): boolean {
  const legacySafariNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    legacySafariNavigator.standalone === true
  );
}

/** iPhone/iPod, кабинет не поставлен на экран «Домой» — Safari 16.4+ отдаёт
 * push только установленному приложению, разрешение спросить нельзя
 * (ADR-0092, RUNBOOK §6.5). Кнопка «Включить уведомления» в этом случае
 * ничего не сделает — раздел обязан объяснить это, а не звать в пустоту. */
export function iosNeedsHomeScreenInstall(): boolean {
  return isIPhone() && !isStandalone();
}
