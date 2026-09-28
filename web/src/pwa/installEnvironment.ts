// Определение «на чём и как открыт кабинет» для подсказки установки на
// телефон (docs/PWA.md). `isStandalone`/`isIPhone` перенесены из
// notifications/webPushEnvironment.ts — та же пара признаков нужна и push
// (iosNeedsHomeScreenInstall), и подсказке установки, повтор литерала иначе
// ловит jscpd (CLAUDE.md «Одна механика — один компонент»).
export type InstallPlatform = 'ios' | 'android' | 'desktop';

/** display-mode: standalone — современный признак установленного PWA;
 * navigator.standalone — то же самое у Safari старых версий, свойство вне
 * стандарта DOM, поэтому в лоб типами TypeScript его не знает. */
export function isStandalone(): boolean {
  const legacySafariNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    legacySafariNavigator.standalone === true
  );
}

/** Только userAgent — другого способа узнать iPhone у браузера нет. Без
 * iPad — та же оговорка, что у webPushEnvironment.ts: Safari на iPad с 2019
 * года выдаёт себя за настольный, надёжно отличить от Mac нельзя, а
 * установленный кабинет на iPad не обещан ни одним документом проекта. */
export function isIPhone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

/** Android-браузер — единственный способ узнать его тоже userAgent. */
export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/** Платформа для текста экрана `/install`: iPhone и Android ставят кабинет
 * по-разному (программно через `beforeinstallprompt` — только Android;
 * iPhone — только шагами руками), остальное — «десктоп»: ставить оттуда
 * некуда, экран показывает адрес и обе телефонные инструкции. */
export function detectInstallPlatform(): InstallPlatform {
  if (isIPhone()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}

/** Предлагать ли установку: телефон (iPhone или Android), не установлен уже
 * (standalone). Десктоп подсказку не получает — там ставить некуда. */
export function shouldOfferInstall(): boolean {
  const platform = detectInstallPlatform();
  return (platform === 'ios' || platform === 'android') && !isStandalone();
}
