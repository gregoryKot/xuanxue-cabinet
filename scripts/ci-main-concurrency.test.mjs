// Гейт ADR-0154: CI на main не отменяется следующим мержем. Railway «Wait for
// CI» пропускает коммит с отменённым CI на стейджинг, если на нём прошёл любой
// другой workflow (release.yml, uptime.yml, backup.yml берут голову main), а
// release-pick не может выкатить коммит без вердикта ci.yml (инцидент
// 2026-09-29, `ebd1ca5`). YAML-парсера в зависимостях нет и тянуть его ради
// одного блока незачем: вырезаем `concurrency:` верхнего уровня текстом.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CI_YML = new URL('../.github/workflows/ci.yml', import.meta.url);

/** Блок `concurrency:` верхнего уровня: строка без отступа и строки с отступом под ней. */
function concurrencyBlock() {
  const lines = readFileSync(CI_YML, 'utf8').split('\n');
  const start = lines.findIndex((line) => line === 'concurrency:');
  assert.notEqual(start, -1, 'в ci.yml нет блока concurrency верхнего уровня (ADR-0154)');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    body.push(line.trim());
  }
  return body.join('\n');
}

test('ci.yml: у каждого коммита main своя группа concurrency (sha)', () => {
  const group = concurrencyBlock().match(/^group:\s*(.+)$/m);
  assert.ok(group, 'в concurrency ci.yml нет group (ADR-0154)');
  assert.match(
    group[1],
    /refs\/heads\/main.*github\.sha/,
    'на main CI не отменяется: группа должна содержать github.sha при refs/heads/main, ' +
      'иначе следующий мерж отменит прогон, а отменённый прогон Railway пропускает на стейджинг (ADR-0154)',
  );
});

test('ci.yml: cancel-in-progress выключен на main', () => {
  const cancel = concurrencyBlock().match(/^cancel-in-progress:\s*(.+)$/m);
  assert.ok(cancel, 'в concurrency ci.yml нет cancel-in-progress (ADR-0154)');
  assert.equal(
    cancel[1].trim(),
    "${{ github.ref != 'refs/heads/main' }}",
    'на main CI не отменяется: отменённый прогон Railway пропускает на стейджинг, ' +
      'а выкат на прод не берёт коммит без вердикта (ADR-0154); отмена допустима только вне main',
  );
});
