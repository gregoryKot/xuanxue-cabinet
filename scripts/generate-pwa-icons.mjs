#!/usr/bin/env node
// Растровые PWA-иконки из web/public/icons/icon.svg (ADR-0032, CLAUDE.md
// «Приложение на телефоне»). Скрипт идемпотентный: результат зависит только
// от icon.svg, перегенерировать после его правки —
//   node scripts/generate-pwa-icons.mjs
//
// icon.svg — печать школы терракотой на бумаге (тот же знак, что
// SchoolMark.tsx; направление «Тёплая школа», docs/adr/0043), без <text>
// (в CI-рендере sharp нет CJK-шрифтов, символ — только rect). Отсюда четыре
// файла:
//   icon-192.png, icon-512.png    — обычная иконка (manifest purpose "any"),
//                                    фон вне круга прозрачный.
//   icon-maskable-512.png         — Android adaptive icons: сплошной фон на
//                                    весь квадрат, символ уменьшен до
//                                    центральных ~80% — safe zone маски
//                                    (круг/сквиркл), иначе OS обрежет символ.
//   apple-touch-icon-180.png      — iOS игнорирует альфа-канал (красит
//                                    прозрачное чёрным), поэтому фон сплошной.
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SVG_PATH = join(ROOT, 'web', 'public', 'icons', 'icon.svg');
const OUT_DIR = join(ROOT, 'web', 'public', 'icons');

/** Заливка фонового прямоугольника — первый fill в файле. */
function readBackgroundColor(svg) {
  const match = /fill="(#[0-9a-fA-F]{3,8})"/.exec(svg);
  if (!match) throw new Error('в icon.svg не нашёлся fill фонового прямоугольника');
  return match[1];
}

// Фон сплошных вариантов — из самого icon.svg (первый rect), не отдельной
// константой: второй источник правды о цвете уже разъезжался — кабинет
// переехал на «Тёплую школу» (docs/adr/0043), а оболочка осталась в палитре
// ADR-0031. Совпадение с фоном SVG обязательно и само по себе: иначе обрезка
// маской или флатенинг оставляют шов другого цвета. Что фон SVG равен токену
// --paper из web/src/index.css, следит scripts/check-pwa.mjs.
const SOLID_BG = readBackgroundColor(readFileSync(SVG_PATH, 'utf8'));
// Доля площади квадрата, которую занимает символ в maskable-варианте.
const MASKABLE_SAFE_ZONE = 0.8;

// icon.svg — квадрат 100×100 юнитов; density переводит целевой размер в px
// пикселей растра так, чтобы rsvg не апскейлил уже отрисованную картинку.
const densityFor = (sizePx) => Math.round((sizePx / 100) * 96);

async function renderAny(size, outFile) {
  await sharp(SVG_PATH, { density: densityFor(size) })
    .resize(size, size)
    .png()
    .toFile(join(OUT_DIR, outFile));
}

async function renderMaskable(size, outFile) {
  const inner = Math.round(size * MASKABLE_SAFE_ZONE);
  const symbol = await sharp(SVG_PATH, { density: densityFor(inner) })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: SOLID_BG },
  })
    .composite([{ input: symbol, gravity: 'center' }])
    .png()
    .toFile(join(OUT_DIR, outFile));
}

async function renderOpaque(size, outFile) {
  await sharp(SVG_PATH, { density: densityFor(size) })
    .resize(size, size)
    .flatten({ background: SOLID_BG })
    .png()
    .toFile(join(OUT_DIR, outFile));
}

await renderAny(192, 'icon-192.png');
await renderAny(512, 'icon-512.png');
await renderMaskable(512, 'icon-maskable-512.png');
await renderOpaque(180, 'apple-touch-icon-180.png');

console.log('✓ PWA-иконки сгенерированы в web/public/icons/');
