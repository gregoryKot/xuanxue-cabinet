#!/usr/bin/env node
// Бюджет стартового JS (CLAUDE.md, «Фронтенд»: «маршруты грузятся лениво,
// тяжёлые библиотеки не тянутся в стартовый бандл»). Меряет реальный вес
// после `npm run build --workspace=web`: <script src> и
// <link rel="modulepreload"> из web/dist/index.html, gzip каждого файла,
// сумма сравнивается с бейслайном scripts/bundle-size-baseline.json.
//   node scripts/check-bundle-size.mjs           — проверка (CI-джоба `web`)
//   node scripts/check-bundle-size.mjs --update  — зафиксировать текущий вес
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'web', 'dist');
const INDEX_PATH = join(DIST, 'index.html');
const BASELINE_PATH = join(ROOT, 'scripts', 'bundle-size-baseline.json');
const UPDATE = process.argv.includes('--update');
const DEFAULT_BUDGET_KB = 200;

if (!existsSync(INDEX_PATH)) {
  console.error('❌ нет web/dist/index.html — сначала npm run build --workspace=web');
  process.exit(1);
}

const html = readFileSync(INDEX_PATH, 'utf8');

function localPaths(regex) {
  const out = [];
  for (const m of html.matchAll(regex)) {
    const url = m[1];
    if (!url || /^(https?:)?\/\//.test(url)) continue; // внешние источники не считаем
    out.push(url.replace(/^\//, ''));
  }
  return out;
}

const scriptPaths = localPaths(/<script[^>]+src=["']([^"']+)["']/g);
const preloadPaths = localPaths(
  /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g,
);
const paths = [...new Set([...scriptPaths, ...preloadPaths])];

const missing = [];
let totalBytes = 0;
for (const p of paths) {
  const filePath = join(DIST, p);
  if (!existsSync(filePath)) {
    missing.push(p);
    continue;
  }
  totalBytes += gzipSync(readFileSync(filePath)).length;
}

if (missing.length) {
  console.error('❌ check-bundle-size: файлы из index.html не найдены в dist:');
  for (const p of missing) console.error(`   ${p}`);
  process.exit(1);
}

const totalKb = totalBytes / 1024;

if (UPDATE) {
  let baseline = { budgetGzipKb: DEFAULT_BUDGET_KB, currentGzipKb: 0 };
  try {
    baseline = { ...baseline, ...JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) };
  } catch {
    // первого запуска ещё нет — берём дефолтный бюджет
  }
  baseline.currentGzipKb = Math.ceil(totalKb);
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `Бейслайн обновлён: ${baseline.currentGzipKb} КБ gzip (бюджет ${baseline.budgetGzipKb} КБ).`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(
    '❌ нет scripts/bundle-size-baseline.json — сгенерируй: node scripts/check-bundle-size.mjs --update',
  );
  process.exit(1);
}

if (totalKb > baseline.budgetGzipKb) {
  console.error(
    `❌ стартовый JS ${totalKb.toFixed(1)} КБ gzip превысил бюджет ${baseline.budgetGzipKb} КБ — ` +
      'ленивые маршруты (React.lazy), тяжёлую библиотеку в отдельный чанк или пересмотреть бюджет с объяснением в PR.',
  );
  process.exit(1);
}

console.log(
  `✓ check-bundle-size: ${totalKb.toFixed(1)}/${baseline.budgetGzipKb} КБ gzip`,
);
