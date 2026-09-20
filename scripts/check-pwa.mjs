#!/usr/bin/env node
// Гейт PWA-сборки (ADR-0032, CLAUDE.md «Приложение на телефоне»): после
// `npm run build --workspace=web` проверяет статический манифест и иконки
// (копируются из web/public/ без изменений — vite build просто переносит
// файл), а также что по адресу /sw.js лежит именно заглушка-килсвитч
// (web/public/sw.js), а не случайно вернувшийся Workbox-worker с прекешем.
// Здесь же сверка цвета оболочки с палитрой кабинета (scripts/
// pwa-shell-colors.mjs): иконку, заставку и полоску браузера человек видит
// раньше любого экрана. CI-джоба `web`.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { findShellColorProblems } from './pwa-shell-colors.mjs';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'web', 'dist');
const MANIFEST_PATH = join(DIST, 'manifest.webmanifest');
const SW_PATH = join(DIST, 'sw.js');
const INDEX_PATH = join(DIST, 'index.html');

// Цвет сверяется в исходниках, а не в web/dist: правка, которую забыли
// собрать, обязана краснеть — иначе гейт зелёный ровно там, где разъезд и
// заводится.
const CSS_PATH = join(ROOT, 'web', 'src', 'index.css');
const HTML_SRC_PATH = join(ROOT, 'web', 'index.html');
const MANIFEST_SRC_PATH = join(ROOT, 'web', 'public', 'manifest.webmanifest');
const ICON_SVG_PATH = join(ROOT, 'web', 'public', 'icons', 'icon.svg');

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch {
  console.error(
    '❌ нет web/dist/manifest.webmanifest — сначала npm run build --workspace=web',
  );
  process.exit(1);
}

const errors = [];

if (manifest.display !== 'standalone')
  errors.push(`manifest.display должен быть "standalone", сейчас: ${manifest.display}`);
if (manifest.lang !== 'ru')
  errors.push(`manifest.lang должен быть "ru", сейчас: ${manifest.lang}`);
if (!manifest.start_url) errors.push('manifest.start_url отсутствует');

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
if (!icons.some((i) => i.sizes === '192x192'))
  errors.push('в manifest.icons нет иконки 192x192');
if (!icons.some((i) => i.sizes === '512x512'))
  errors.push('в manifest.icons нет иконки 512x512');
if (!icons.some((i) => (i.purpose ?? '').split(' ').includes('maskable')))
  errors.push('в manifest.icons нет иконки с purpose "maskable"');

for (const icon of icons) {
  if (!existsSync(join(DIST, String(icon.src).replace(/^\//, ''))))
    errors.push(`файл иконки не найден в dist: ${icon.src}`);
}

if (!existsSync(SW_PATH)) {
  // Килсвитч обязан быть по старому адресу (ADR-0032) — без него браузеры,
  // у которых уже стоит старый Workbox-worker, годами не увидят обновления.
  errors.push('web/dist/sw.js не найден — заглушка service worker не скопировалась');
} else {
  const swText = readFileSync(SW_PATH, 'utf8');
  if (
    swText.includes('precache') ||
    swText.includes('workbox') ||
    swText.includes('"url":')
  )
    errors.push(
      'web/dist/sw.js похож на настоящий Workbox-worker с прекешем, а не на заглушку-килсвитч (ADR-0032)',
    );
}

if (!existsSync(INDEX_PATH)) {
  errors.push('web/dist/index.html не найден');
} else {
  const indexText = readFileSync(INDEX_PATH, 'utf8');
  if (!/rel=["']manifest["']/.test(indexText))
    errors.push('index.html не ссылается на manifest (rel="manifest")');
  if (!/theme-color/.test(indexText))
    errors.push('index.html не содержит meta theme-color');
}

const shellProblems = findShellColorProblems({
  css: readFileSync(CSS_PATH, 'utf8'),
  indexHtml: readFileSync(HTML_SRC_PATH, 'utf8'),
  manifest: JSON.parse(readFileSync(MANIFEST_SRC_PATH, 'utf8')),
  iconSvg: readFileSync(ICON_SVG_PATH, 'utf8'),
});
errors.push(...shellProblems);

if (errors.length) {
  console.error('❌ check-pwa: найдены проблемы PWA-сборки:');
  for (const e of errors) console.error(`   ${e}`);
  if (shellProblems.length)
    console.error(
      'Знак школы на входе, в кабинете и на иконке обязан совпадать, иначе человек\n' +
        'не узнаёт то же место. Цвета оболочки идут от токенов web/src/index.css —\n' +
        'поправь и перегенерируй растр: node scripts/generate-pwa-icons.mjs',
    );
  process.exit(1);
}

console.log('✓ check-pwa: манифест, иконки, цвет оболочки и заглушка sw в порядке');
