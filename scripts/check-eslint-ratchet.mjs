#!/usr/bin/env node
// eslint-храповик (CLAUDE.md правило №9/раздел «Храповики»). Суммарный
// счётчик ошибок+варнингов сравнивается с закоммиченным бейслайном — рост
// роняет CI, снижение приветствуется:
//   node scripts/check-eslint-ratchet.mjs --update
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'eslint-baseline.json');
const UPDATE = process.argv.includes('--update');

const res = spawnSync('npx', ['eslint', '.', '--format', 'json'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 512 * 1024 * 1024,
});
// eslint выходит с 1 при наличии ошибок — норма; фатальны только сбои
// самого запуска (нет бинаря, кривой конфиг → пустой/невалидный stdout).
let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error('❌ eslint не отработал:\n' + (res.stderr || res.stdout).slice(0, 2000));
  process.exit(1);
}

let errors = 0;
let warnings = 0;
const byRule = {};
for (const f of report) {
  errors += f.errorCount;
  warnings += f.warningCount;
  for (const m of f.messages) {
    const rule = m.ruleId ?? '(parse)';
    byRule[rule] = (byRule[rule] || 0) + 1;
  }
}
const total = errors + warnings;

if (UPDATE) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ total, errors, warnings, byRule }, null, 2) + '\n',
  );
  console.log(`Бейслайн обновлён: ${total} (errors ${errors}, warnings ${warnings}).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(
    'Нет бейслайна — сгенерируй: node scripts/check-eslint-ratchet.mjs --update',
  );
  process.exit(1);
}

if (total > baseline.total) {
  console.error(
    `❌ eslint-храповик: счётчик вырос ${baseline.total} → ${total} ` +
      `(errors ${baseline.errors} → ${errors}, warnings ${baseline.warnings} → ${warnings}).`,
  );
  console.error('Правила с ростом против бейслайна (и файлы с их вхождениями):');
  for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    const base = baseline.byRule?.[rule] ?? 0;
    if (n <= base) continue;
    console.error(`   ${rule}: ${base} → ${n}`);
    for (const f of report) {
      const hits = f.messages.filter((m) => (m.ruleId ?? '(parse)') === rule);
      if (hits.length) {
        console.error(`      ${f.filePath}: ${hits.length}`);
        for (const m of hits.slice(0, 5))
          console.error(`         стр. ${m.line}: ${JSON.stringify(m.message).slice(0, 160)}`);
      }
    }
  }
  console.error(
    'Правило №9 CLAUDE.md: ни один PR не увеличивает счётчик eslint.\n' +
      'Почини свои вхождения (npx eslint <файл> покажет их); бейслайн\n' +
      'обновляется только вниз: node scripts/check-eslint-ratchet.mjs --update',
  );
  process.exit(1);
}

if (total < baseline.total) {
  console.log(
    `✓ eslint-храповик: ${total} ≤ ${baseline.total} — стало лучше, ` +
      'зафиксируй прогресс: node scripts/check-eslint-ratchet.mjs --update',
  );
} else {
  console.log(`✓ eslint-храповик: ${total} (без роста)`);
}
