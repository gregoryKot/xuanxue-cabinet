import { join } from 'path';
import {
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  staticAssetsOptions,
  staticCacheControl,
} from './static-cache-control';

describe('staticCacheControl', () => {
  it('файл из /assets/ кешируется на год как неизменяемый — в имени хэш Vite', () => {
    expect(staticCacheControl('/assets/index-abc123.js')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(staticCacheControl('/assets/index-abc123.css')).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it('index.html, sw.js и иконки — no-cache: адрес постоянный, содержимое меняется', () => {
    expect(staticCacheControl('/index.html')).toBe(REVALIDATE_CACHE_CONTROL);
    expect(staticCacheControl('/sw.js')).toBe(REVALIDATE_CACHE_CONTROL);
    expect(staticCacheControl('/manifest.webmanifest')).toBe(REVALIDATE_CACHE_CONTROL);
    expect(staticCacheControl('/icons/icon-192.png')).toBe(REVALIDATE_CACHE_CONTROL);
  });

  it('путь без ведущего слеша и в обратных слешах разбирается так же', () => {
    expect(staticCacheControl('assets/index-abc123.js')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(staticCacheControl('assets\\index-abc123.js')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(staticCacheControl('\\assets\\index-abc123.js')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(staticCacheControl('index.html')).toBe(REVALIDATE_CACHE_CONTROL);
  });

  it('пустой путь и путь вне корня — no-cache, а не «на год»', () => {
    expect(staticCacheControl('')).toBe(REVALIDATE_CACHE_CONTROL);
    expect(staticCacheControl('../assets/index-abc123.js')).toBe(
      REVALIDATE_CACHE_CONTROL,
    );
    // Каталог с таким именем не в корне dist — не наши хэшированные файлы.
    expect(staticCacheControl('icons/assets/icon.png')).toBe(REVALIDATE_CACHE_CONTROL);
  });
});

describe('staticAssetsOptions', () => {
  const ROOT = join('/srv', 'app', 'web', 'dist');

  function headerFor(filePath: string): string | undefined {
    const headers = new Map<string, string>();
    const res = {
      setHeader: (name: string, value: string) => headers.set(name, value),
    };
    const options = staticAssetsOptions(ROOT);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- функция задаётся тут же, рядом
    options.serveStaticOptions!.setHeaders!(res, filePath, null);
    return headers.get('Cache-Control');
  }

  it('ставит Cache-Control по абсолютному пути файла внутри корня', () => {
    expect(headerFor(join(ROOT, 'assets', 'index-abc123.js'))).toBe(
      IMMUTABLE_CACHE_CONTROL,
    );
    expect(headerFor(join(ROOT, 'index.html'))).toBe(REVALIDATE_CACHE_CONTROL);
    expect(headerFor(join(ROOT, 'sw.js'))).toBe(REVALIDATE_CACHE_CONTROL);
  });

  it('оставляет /api за контроллерами Nest', () => {
    expect(staticAssetsOptions(ROOT).exclude).toEqual(['/api/{*splat}']);
    expect(staticAssetsOptions(ROOT).rootPath).toBe(ROOT);
  });
});
