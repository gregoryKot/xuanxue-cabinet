// Ролики «значок кабинета на экран телефона» — по одному на браузер, у
// которого свой путь установки. Файлы собирает scripts/install-video/render.mjs;
// импорт отдаёт адрес с хэшем содержимого (каталог assets, кешируется навсегда),
// сами байты в JS экрана не попадают.
import type { InstallBrowser } from '../pwa/installEnvironment';
import androidChrome from './videos/install-android-chrome.mp4';
import androidYandex from './videos/install-android-yandex.mp4';
import iosChrome from './videos/install-ios-chrome.mp4';
import iosSafari from './videos/install-ios-safari.mp4';

interface InstallVideoSource {
  src: string;
  /** Название браузера для подписи под роликом — в родительном падеже,
   * подпись говорит «из …» (installAppCopy.ts, videoCaption). */
  browserName: string;
}

export const INSTALL_VIDEOS: Record<InstallBrowser, InstallVideoSource> = {
  'ios-safari': { src: iosSafari, browserName: 'Safari на iPhone' },
  'ios-chrome': { src: iosChrome, browserName: 'Chrome на iPhone' },
  'android-chrome': { src: androidChrome, browserName: 'Chrome на Android' },
  'android-yandex': { src: androidYandex, browserName: 'Яндекс Браузера на Android' },
};
