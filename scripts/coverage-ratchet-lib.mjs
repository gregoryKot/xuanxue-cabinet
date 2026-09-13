// Общая логика coverage-храповиков api (check-coverage-ratchet.mjs) и web
// (check-web-coverage-ratchet.mjs): запуск тестового раннера с покрытием,
// чтение summary/бейслайна и сравнение процентов. Раздельные точки входа —
// у api есть жёсткий пол по директориям (api/src/utils), у web его нет —
// здесь только то, что реально одинаково по факту (CLAUDE.md, «Храповики»:
// правило без механизма принуждения не работает, но копия кода — не механизм).
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

export const EPSILON = 0.1;

// Запускает jest/vitest с покрытием и сразу отдаёт его вывод в терминал.
// status/signal логируются отдельно: иначе SIGKILL по памяти не отличить от
// упавшего теста (было одинаковой правкой в обоих скриптах).
export function runTestsWithCoverage(cmd, args, spawnOpts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    ...spawnOpts,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.error) {
    console.error(`❌ не удалось запустить ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`❌ ${cmd} упал: status=${res.status} signal=${res.signal}`);
    process.exit(res.status ?? 1);
  }
}

export function loadSummary(summaryPath) {
  try {
    return JSON.parse(readFileSync(summaryPath, 'utf8'));
  } catch {
    console.error(
      `❌ не найден ${summaryPath} — раннер не сгенерировал coverage-summary.json.`,
    );
    process.exit(1);
  }
}

export function loadBaseline(baselinePath, updateCommand) {
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    console.error(`Нет бейслайна — сгенерируй: ${updateCommand}`);
    process.exit(1);
  }
}

// Сравнивает current[metric] с baseline[metric] по списку metricNames,
// печатает понятный итог по-русски и завершает процесс: 1 при просадке
// больше EPSILON (или при extraFailureLines), иначе 0. extraFailureLines и
// extraOkSuffix — место для доп. проверок конкретного скрипта (у api это
// жёсткий пол по директориям).
export function checkMetricsRatchet({
  metricNames,
  current,
  baseline,
  label,
  updateCommand,
  extraFailureLines = [],
  extraOkSuffix = '',
}) {
  const failures = [];
  for (const name of metricNames) {
    if (baseline[name] - current[name] > EPSILON) {
      failures.push(`${name}: ${baseline[name]}% → ${current[name]}%`);
    }
  }

  if (failures.length > 0 || extraFailureLines.length > 0) {
    console.error(`❌ ${label}: покрытие просело.`);
    if (failures.length > 0) {
      console.error('Метрики:');
      for (const f of failures) console.error(`   ${f}`);
    }
    if (extraFailureLines.length > 0) {
      console.error('Доп. проверки:');
      for (const f of extraFailureLines) console.error(`   ${f}`);
    }
    console.error(
      'Правило CLAUDE.md «Тесты»: новый код приезжает с тестами — покрытие не должно падать.\n' +
        `Если снижение осознанное — обнови бейслайн: ${updateCommand}`,
    );
    process.exit(1);
  }

  const improved = metricNames.some((name) => current[name] - baseline[name] > EPSILON);
  const parts = metricNames.map(
    (name) => `${name} ${current[name]}%${improved ? ` (было ${baseline[name]}%)` : ''}`,
  );
  if (improved) {
    console.log(
      `✓ ${label}: ${parts.join(', ')} — стало лучше, зафиксируй прогресс: ${updateCommand}`,
    );
  } else {
    console.log(`✓ ${label}: ${parts.join(', ')} (без просадки)${extraOkSuffix}`);
  }
}
