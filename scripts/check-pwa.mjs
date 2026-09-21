#!/usr/bin/env node
// Гейт PWA-сборки (ADR-0092, CLAUDE.md «Приложение на телефоне»): после
// `npm run build --workspace=web` проверяет статический манифест и иконки
// (копируются из web/public/ без изменений — vite build просто переносит
// файл), а также что по адресу /sw.js лежит push-worker (web/public/sw.js,
// ADR-0092), а не заглушка-пустышка и не случайно вернувшийся
// Workbox-worker с прекешем. Здесь же — сверка бумаги оболочки с токеном
// --paper (scripts/pwa-shell-colors.mjs) и сверка «знак везде один»
// (scripts/pwa-icon-sources.mjs, docs/adr/0085): иконку, заставку и полоску
// браузера человек видит раньше любого экрана кабинета. CI-джоба `web`.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { findShellColorProblems } from './pwa-shell-colors.mjs';
import { collectIconSourceProblems, REGENERATE_HINT } from './pwa-icon-sources.mjs';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'web', 'dist');
const MANIFEST_PATH = join(DIST, 'manifest.webmanifest');
const SW_PATH = join(DIST, 'sw.js');
const INDEX_PATH = join(DIST, 'index.html');

// Цвет и знак сверяются в исходниках, а не в web/dist: правка, которую
// забыли собрать, обязана краснеть — иначе гейт зелёный ровно там, где
// разъезд и заводится.
const CSS_PATH = join(ROOT, 'web', 'src', 'index.css');
const HTML_SRC_PATH = join(ROOT, 'web', 'index.html');
const MANIFEST_SRC_PATH = join(ROOT, 'web', 'public', 'manifest.webmanifest');

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
  // Push-worker обязан быть по тому же адресу, где раньше жил килсвитч
  // (ADR-0032 → ADR-0092) — без него браузеры, у которых уже стоит старый
  // Workbox-worker, годами не увидят обновления, а у новых людей не будет
  // регистрации для push.
  errors.push('web/dist/sw.js не найден — push-worker не скопировался');
} else {
  const swText = readFileSync(SW_PATH, 'utf8');
  if (
    swText.includes('precache') ||
    swText.includes('workbox') ||
    swText.includes('"url":')
  )
    errors.push(
      'web/dist/sw.js похож на настоящий Workbox-worker с прекешем — прекеш не должен вернуться вместе с push (ADR-0092)',
    );
  // Пустышка (или регресс обратно в килсвитч) прошла бы проверку выше молча —
  // этот файл обязан реально уметь push: слушать событие и показывать
  // уведомление (ADR-0092, «Порядок работ» п.2).
  if (!/addEventListener\(\s*['"]push['"]/.test(swText))
    errors.push('web/dist/sw.js не слушает событие push (ADR-0092)');
  if (!swText.includes('showNotification'))
    errors.push(
      'web/dist/sw.js не вызывает showNotification — push нечем показать (ADR-0092)',
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

const cssText = readFileSync(CSS_PATH, 'utf8');
const shellProblems = findShellColorProblems({
  css: cssText,
  indexHtml: readFileSync(HTML_SRC_PATH, 'utf8'),
  manifest: JSON.parse(readFileSync(MANIFEST_SRC_PATH, 'utf8')),
});
errors.push(...shellProblems);

const iconSourceProblems = collectIconSourceProblems({
  root: ROOT,
  dist: DIST,
  css: cssText,
});
errors.push(...iconSourceProblems);

if (errors.length) {
  console.error('❌ check-pwa: найдены проблемы PWA-сборки:');
  for (const e of errors) console.error(`   ${e}`);
  if (shellProblems.length)
    console.error(
      'Бумага кабинета и полоска браузера идут от токена --paper (web/src/index.css) — ' +
        'поправь meta theme-color в web/index.html и theme_color/background_color манифеста.',
    );
  if (iconSourceProblems.length)
    console.error(
      'Знак школы на входе, в кабинете и на иконках — один файл (docs/adr/0085): ' +
        `смени его или палитру и собери заново — ${REGENERATE_HINT}`,
    );
  process.exit(1);
}

console.log('✓ check-pwa: манифест, иконки, цвет оболочки, знак и push-worker в порядке');
