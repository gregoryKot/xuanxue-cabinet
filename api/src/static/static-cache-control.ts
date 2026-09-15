// Заголовки кеша для собранного web/dist и настройка ServeStaticModule под
// них (подключается в app.module.ts).
//
// Почему: на проде измерено (2026-09-15), что TTFB любого ответа сервера —
// 0.5–1.1 с, а файлы из `/assets/*` отдавались с `Cache-Control: public,
// max-age=0`. Это значит, что каждый повторный визит переспрашивал сервер
// про каждый файл: приходило 304 «не изменилось», но те же полсекунды
// тратились на каждый файл. Имя файла в `/assets/` Vite собирает с хэшем
// содержимого, поэтому по такому адресу содержимое не меняется никогда —
// его можно кешировать на год и больше не спрашивать.
//
// Всё остальное (index.html, manifest.webmanifest, sw.js, иконки) живёт по
// постоянным адресам, и новая версия приезжает по тому же пути — им
// `no-cache`: «бери из кеша, но сначала спроси, не устарело ли». Особенно
// это важно для sw.js: service worker — килсвитч всей PWA (docs/adr/0032),
// а залипший в кеше килсвитч нечем выключить.
import { relative } from 'path';
import type { ServerResponse } from 'http';
import type { ServeStaticModuleOptions } from '@nestjs/serve-static';

const ONE_YEAR_SECONDS = 31_536_000;

/** Содержимое по адресу не изменится никогда — хэш в имени файла (Vite). */
export const IMMUTABLE_CACHE_CONTROL = `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
/** Адрес постоянный, содержимое меняется с деплоем — спрашиваем сервер каждый раз. */
export const REVALIDATE_CACHE_CONTROL = 'no-cache';

/** Каталог Vite с файлами, у которых хэш содержимого в имени. */
const HASHED_ASSETS_DIR = 'assets';
const CACHE_CONTROL_HEADER = 'Cache-Control';

/**
 * Какой `Cache-Control` ставить файлу по его пути внутри web/dist.
 * Путь приходит от express.static в разделителях своей ОС, поэтому режем и
 * по `/`, и по `\`, а пустые сегменты (ведущий слеш, двойной слеш)
 * отбрасываем.
 */
export function staticCacheControl(pathInsideRoot: string): string {
  const [firstSegment] = pathInsideRoot.split(/[\\/]+/).filter(Boolean);
  return firstSegment === HASHED_ASSETS_DIR
    ? IMMUTABLE_CACHE_CONTROL
    : REVALIDATE_CACHE_CONTROL;
}

/**
 * Настройки раздачи web/dist. Отдельной функцией, а не литералом в
 * app.module.ts, чтобы ровно это поведение проверял тест на настоящем
 * express (api/test/static-cache.e2e-spec.ts).
 */
export function staticAssetsOptions(rootPath: string): ServeStaticModuleOptions {
  return {
    rootPath,
    exclude: ['/api/{*splat}'],
    serveStaticOptions: {
      // setHeaders зовут оба пути раздачи: express.static на каждый найденный
      // файл и SPA-фолбэк @nestjs/serve-static перед res.sendFile(index.html).
      // Поэтому одна функция закрывает и ассеты, и любой адрес кабинета.
      setHeaders: (res: ServerResponse, filePath: string): void => {
        res.setHeader(
          CACHE_CONTROL_HEADER,
          staticCacheControl(relative(rootPath, filePath)),
        );
      },
    },
  };
}
