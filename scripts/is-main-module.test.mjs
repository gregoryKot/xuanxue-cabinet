// Тест на is-main-module.mjs и гейт против возврата сломанного сравнения.
// Инцидент 2026-10-13: сравнение `import.meta.url` со строкой из префикса
// file и argv[1] на Windows всегда ложно, 25 гейтов молча завершались с кодом 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { isMainModule } from './is-main-module.mjs';

const SCRIPTS_DIR = import.meta.dirname;
// Собрано из частей, чтобы сам этот тест не нашёл шаблон в своём тексте.
const BROKEN_PATTERN = ['file:', '//${process.argv[1]}'].join('');

// process.argv[1] подменяется на время проверки и возвращается назад: иначе
// тест влияет на соседей в том же процессе.
function withArgv1(value, check) {
  const original = process.argv[1];
  process.argv[1] = value;
  try {
    check();
  } finally {
    process.argv[1] = original;
  }
}

test('isMainModule: URL файла из argv[1] → true', () => {
  const entry = join(SCRIPTS_DIR, 'entry-fixture.mjs');
  withArgv1(entry, () => {
    assert.equal(isMainModule(pathToFileURL(entry).href), true);
  });
});

test('isMainModule: URL другого файла → false', () => {
  withArgv1(join(SCRIPTS_DIR, 'entry-fixture.mjs'), () => {
    assert.equal(isMainModule(pathToFileURL(join(SCRIPTS_DIR, 'other.mjs')).href), false);
  });
});

test('isMainModule: argv[1] не задан (REPL, `node -e`) → false', () => {
  withArgv1(undefined, () => {
    assert.equal(isMainModule(import.meta.url), false);
  });
});

test('гейт: в scripts/*.mjs нет сравнения точки входа со строкой из argv[1]', () => {
  const offenders = readdirSync(SCRIPTS_DIR)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) =>
      readFileSync(join(SCRIPTS_DIR, name), 'utf8').includes(BROKEN_PATTERN),
    );

  assert.deepEqual(
    offenders,
    [],
    `Файлы со сломанным на Windows сравнением точки входа: ${offenders.join(', ')}. ` +
      'Используйте isMainModule(import.meta.url) из ./is-main-module.mjs.',
  );
});
