#!/usr/bin/env node
// Растровые PWA-иконки из web/brand/school-mark.webp — фотография печати
// школы (черепаха, XUANXUE, 玄学; docs/adr/0085): это живопись по ткани, а не
// фигура, вектором её не повторить, поэтому источник растровый и лежит вне
// web/public — браузеру не раздаётся, раздаются только результаты этого
// скрипта. Перегенерировать после правки источника или токена --paper —
//   node scripts/generate-pwa-icons.mjs
//
// Источник — круг 512×512, углы прозрачные. Отсюда семь файлов в
// web/public/icons/:
//   school-mark-512.png,
//   school-mark-192.png         — обычная иконка (manifest purpose "any"),
//                                  фон вне круга прозрачный.
//   school-mark-maskable-512.png — Android adaptive icons: сплошной фон на
//                                  весь квадрат, знак уменьшен до центральных
//                                  ~80% — safe zone маски (круг/сквиркл),
//                                  иначе OS обрежет знак.
//   school-mark-apple-180.png   — iOS игнорирует альфа-канал (красит
//                                  прозрачное чёрным), поэтому фон сплошной;
//                                  safe zone не нужен — угол скругляет сама ОС.
//   school-mark-64.png          — знак в интерфейсе (SchoolMark.tsx рисует
//                                  его 26×26 — 64 закрывает экраны 2×).
//   favicon-32.png, favicon-16.png — вкладка браузера.
import sharp from 'sharp';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SOURCE_PATH = join(ROOT, 'web', 'brand', 'school-mark.webp');
const SOURCE_REL = 'web/brand/school-mark.webp';
const OUT_DIR = join(ROOT, 'web', 'public', 'icons');
const CSS_PATH = join(ROOT, 'web', 'src', 'index.css');
const BASELINE_PATH = join(ROOT, 'scripts', 'pwa-icons-baseline.json');

/** Заливка сплошных вариантов — токен --paper из web/src/index.css, а не
 * константа в скрипте: второй источник правды о цвете уже разъезжался —
 * оболочка отставала от палитры два месяца (docs/adr/0085). Совпадение с
 * этим же токеном при следующей смене палитры держит scripts/check-pwa.mjs. */
function readPaperToken(css) {
  const match = /--paper:\s*(#[0-9a-fA-F]{3,8})/.exec(css);
  if (!match) throw new Error('в web/src/index.css не нашёлся токен --paper');
  return match[1];
}

const SOLID_BG = readPaperToken(readFileSync(CSS_PATH, 'utf8'));
// Доля площади квадрата, которую занимает знак в maskable-варианте.
const MASKABLE_SAFE_ZONE = 0.8;
// Палитровое png: фотография в полном цвете 512×512 весит 536 КБ, палитровая
// — 171 КБ при той же на глаз картинке (печать — не градиент, миллионы
// цветов ей не нужны).
const PNG_OPTIONS = { palette: true, quality: 90, effort: 10 };
// Мелким размерам ресайз размывает деталь печати сильнее, чем крупным: без
// доп. резкости на вкладке 32×32 черепаха превращается в пятно (проверено
// глазом). Крупные размеры не шарпим — там незаметно и не нужно.
const SHARPEN = { sigma: 0.7 };
const SHARPEN_MAX_SIZE = 64;

async function renderTransparent(size, outFile) {
  let image = sharp(SOURCE_PATH).resize(size, size);
  if (size <= SHARPEN_MAX_SIZE) image = image.sharpen(SHARPEN);
  await image.png(PNG_OPTIONS).toFile(join(OUT_DIR, outFile));
}

async function renderMaskable(size, outFile) {
  const inner = Math.round(size * MASKABLE_SAFE_ZONE);
  const symbol = await sharp(SOURCE_PATH).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: SOLID_BG },
  })
    .composite([{ input: symbol, gravity: 'center' }])
    .png(PNG_OPTIONS)
    .toFile(join(OUT_DIR, outFile));
}

async function renderOpaque(size, outFile) {
  await sharp(SOURCE_PATH)
    .resize(size, size)
    .flatten({ background: SOLID_BG })
    .png(PNG_OPTIONS)
    .toFile(join(OUT_DIR, outFile));
}

// Порядок — от крупной иконки к мелкой: manifest any, maskable, apple, знак
// в кабинете, вкладка браузера. Тот же порядок идёт в outputs бейслайна ниже.
await renderTransparent(512, 'school-mark-512.png');
await renderTransparent(192, 'school-mark-192.png');
await renderMaskable(512, 'school-mark-maskable-512.png');
await renderOpaque(180, 'school-mark-apple-180.png');
await renderTransparent(64, 'school-mark-64.png');
await renderTransparent(32, 'favicon-32.png');
await renderTransparent(16, 'favicon-16.png');

// Бейслайн — то, за чем следит check-pwa.mjs (docs/adr/0085): sha источника
// ловит «поменяли лого и забыли перегенерировать», background — «сменили
// палитру, а фон иконок остался прежним». Порядок ключей и путей
// фиксированный — файл идёт в git, дифф читается по смыслу, не по сортировке.
const baseline = {
  source: SOURCE_REL,
  sourceSha256: createHash('sha256').update(readFileSync(SOURCE_PATH)).digest('hex'),
  background: SOLID_BG,
  outputs: [
    'icons/school-mark-512.png',
    'icons/school-mark-192.png',
    'icons/school-mark-maskable-512.png',
    'icons/school-mark-apple-180.png',
    'icons/school-mark-64.png',
    'icons/favicon-32.png',
    'icons/favicon-16.png',
  ],
};
writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');

console.log('✓ PWA-иконки сгенерированы в web/public/icons/, бейслайн обновлён');
