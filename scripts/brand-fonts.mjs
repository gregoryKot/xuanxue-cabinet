// Шрифты кабинета для картинок, которые рисует sharp (пока это превью ссылки
// — scripts/brand-preview.mjs). Golos Text и Cormorant Garamond лежат в
// node_modules пакетами @fontsource (web/src/fonts.ts, ADR-0043) в формате
// woff2: системе они неизвестны, и librsvg внутри sharp набрал бы строку
// подстановочной гарнитурой — картинка превью разъехалась бы с кабинетом, и
// заметить это можно было бы только глазом.
//
// FreeType умеет читать woff2, а найти файл ему даёт fontconfig — по каталогу,
// названному в конфиге. Конфиг собирается во временном каталоге и подсовывается
// переменной FONTCONFIG_FILE. Переменная обязана встать ДО первой загрузки
// sharp: fontconfig инициализируется один раз, и если он успел подняться со
// своим конфигом, строка выходит рядом плашек-тофу (проверено 2026-09-22).
// Поэтому sharp грузится только отсюда и только динамическим `import` —
// статического `import sharp from 'sharp'` в скриптах, которые рисуют текст,
// быть не должно: hoisting ESM выполнил бы его раньше любой строки кода.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

const ROOT = join(import.meta.dirname, '..');

/** Имя семейства для SVG — ровно то, что объявляет сам файл шрифта. */
export const BRAND_FONT_FAMILY = 'Golos Text';

// Подмножества latin и cyrillic обоих нужных начертаний: кириллица набирает
// сами слова, латиница закрывает дефис, запятую и кавычки — они живут в
// latin-подмножестве, и без него дорисовывала бы их чужая гарнитура.
const FONT_FILES = [
  'node_modules/@fontsource/golos-text/files/golos-text-cyrillic-500-normal.woff2',
  'node_modules/@fontsource/golos-text/files/golos-text-cyrillic-600-normal.woff2',
  'node_modules/@fontsource/golos-text/files/golos-text-latin-500-normal.woff2',
  'node_modules/@fontsource/golos-text/files/golos-text-latin-600-normal.woff2',
];

/**
 * Готовит fontconfig под шрифты кабинета и отдаёт загруженный sharp.
 * Зовётся один раз в начале скрипта — дальше sharp берётся из результата.
 */
export async function loadSharpWithBrandFonts() {
  const dir = mkdtempSync(join(tmpdir(), 'xuanxue-fonts-'));
  const fontsDir = join(dir, 'fonts');
  mkdirSync(fontsDir);

  for (const relativePath of FONT_FILES) {
    const source = join(ROOT, relativePath);
    if (!existsSync(source))
      throw new Error(`нет файла шрифта ${relativePath} — выполни npm ci и повтори`);
    copyFileSync(source, join(fontsDir, basename(relativePath)));
  }

  // include системного конфига оставляет запасную гарнитуру на случай знака,
  // которого нет ни в одном из подмножеств выше: лучше чужая буква, чем тофу.
  writeFileSync(
    join(dir, 'fonts.conf'),
    '<?xml version="1.0"?><fontconfig>' +
      `<dir>${fontsDir}</dir><cachedir>${join(dir, 'cache')}</cachedir>` +
      '<include ignore_missing="yes">/etc/fonts/fonts.conf</include>' +
      '</fontconfig>\n',
  );
  process.env.FONTCONFIG_FILE = join(dir, 'fonts.conf');

  return (await import('sharp')).default;
}
