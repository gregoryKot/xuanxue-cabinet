#!/usr/bin/env node
// Гейт PWA-сборки (ADR-0006, CLAUDE.md «Приложение на телефоне»): после
// `npm run build --workspace=web` проверяет манифест, иконки, service worker
// и то, что /api никогда не попадает в precache SW. CI-джоба `web`.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'web', 'dist');
const MANIFEST_PATH = join(DIST, 'manifest.webmanifest');
const SW_PATH = join(DIST, 'sw.js');
const INDEX_PATH = join(DIST, 'index.html');

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
  errors.push('web/dist/sw.js не найден — service worker не собрался');
} else {
  const swText = readFileSync(SW_PATH, 'utf8');
  if (swText.includes('"url":"api/') || swText.includes('"url":"/api/'))
    errors.push(
      'precache-манифест sw.js содержит /api/ — API не кешируется никогда (CLAUDE.md)',
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

if (errors.length) {
  console.error('❌ check-pwa: найдены проблемы PWA-сборки:');
  for (const e of errors) console.error(`   ${e}`);
  process.exit(1);
}

console.log('✓ check-pwa: manifest, иконки и service worker в порядке');
