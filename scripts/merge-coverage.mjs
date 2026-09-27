#!/usr/bin/env node
// Склейка сырого покрытия (coverage-final.json) нескольких шардов jest/vitest
// в один json-summary — тот же формат, что пишет istanbul-reports
// json-summary reporter (используют check-coverage-ratchet.mjs и
// check-vitest-coverage-ratchet.mjs). Нужна, потому что храповик считает
// порог по покрытию ВСЕГО набора, а один шард видит только свою часть
// (CI: шардинг api-coverage/web-coverage сокращает критический путь, порог
// проверяет отдельная джоба *-coverage-ratchet после склейки артефактов).
// istanbul-lib-coverage — CommonJS без proper ESM named exports (иначе
// "Named export 'createCoverageMap' not found" под node:test).
import istanbulLibCoverage from 'istanbul-lib-coverage';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { pathToFileURL } from 'url';

const { createCoverageMap } = istanbulLibCoverage;

/**
 * Сливает список сырых coverage-final.json (уже распарсенных объектов) в
 * summary того же формата, что пишет istanbul json-summary reporter:
 * { total: {...}, "<abs path>": {...}, ... }.
 * @param {object[]} coverageJsonObjects
 * @returns {object}
 */
export function mergeCoverage(coverageJsonObjects) {
  if (!coverageJsonObjects || coverageJsonObjects.length === 0) {
    throw new Error('mergeCoverage: нет входных данных для склейки');
  }

  const map = createCoverageMap({});
  for (const raw of coverageJsonObjects) {
    map.merge(raw);
  }

  const summary = { total: map.getCoverageSummary().toJSON() };
  for (const file of map.files()) {
    summary[file] = map.fileCoverageFor(file).toSummary().toJSON();
  }
  return summary;
}

function main() {
  const [outPath, ...inputPaths] = process.argv.slice(2);

  if (!outPath || inputPaths.length === 0) {
    console.error(
      'Использование: node scripts/merge-coverage.mjs <out-summary.json> <coverage-final.json>...',
    );
    process.exit(1);
  }

  const parsed = [];
  for (const p of inputPaths) {
    let text;
    try {
      text = readFileSync(p, 'utf8');
    } catch (err) {
      console.error(`❌ не удалось прочитать ${p}: ${err.message}`);
      process.exit(1);
    }
    try {
      parsed.push(JSON.parse(text));
    } catch (err) {
      console.error(`❌ не удалось разобрать JSON ${p}: ${err.message}`);
      process.exit(1);
    }
  }

  let summary;
  try {
    summary = mergeCoverage(parsed);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // В джобе склейки тесты не запускались — каталога coverage/ ещё нет.
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(
    `✓ склеено ${inputPaths.length} файлов покрытия → ${outPath} (total lines ${summary.total.lines.pct}%)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
