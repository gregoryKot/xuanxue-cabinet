#!/usr/bin/env node
// Раннер `npm run check`, который не теряет сигнал упавшего шага (CLAUDE.md,
// раздел «Ничего не мержится с красным CI»). Инцидент 2026-09-20: e2e-jest
// падал от нехватки памяти (SIGABRT, код выхода 134, ADR-0070), а наружу из
// цепочки шагов через `&&` уезжал код 0 — упавший гейт выглядел зелёным, и
// единственная локальная защита перед PR молча не срабатывала. Где именно
// терялся код, воспроизвести не вышло: на Linux с npm 10.9.7 и сам `npm run`,
// и `npm run --workspace=…` отдают 134 честно, значит теряет его либо npm
// другой платформы, либо обёртка, из которой зовут `npm run check`.
//
// Поэтому раннер не полагается на код выхода вовсе: каждый шаг он запускает
// `spawnSync` сам, разбирает `status`/`signal`/`error` явно (describeExit) и
// наружу отдаёт обычный код 1. Обычный ненулевой код через npm проходит —
// это проверено на той же связке, где терялся сигнал.
//
// Шаги — данные (CHECK_STEPS), не текст команды: `spawnSync(command, args)`
// без shell, поэтому не нужно экранировать `&&`, а `TZ=...` шага передаётся
// через `env`, не через синтаксис командной строки.
import { spawnSync } from 'child_process';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SYDNEY_TZ = 'Australia/Sydney';
const VITEST_RATCHET = 'scripts/check-vitest-coverage-ratchet.mjs';

// Порядок и состав шагов — тот же, что был у цепочки `check` в корневом
// package.json; теперь этот список и есть `npm run check`, новый шаг
// добавляется сюда. Порядок не случайный: дешёвые проверки (сборка, tsc,
// eslint) идут раньше долгих тестов, чтобы опечатка падала на второй минуте,
// а не на двенадцатой.
export const CHECK_STEPS = [
  { name: 'сборка shared', command: 'npm', args: ['run', 'build', '--workspace=shared'] },
  { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { name: 'eslint', command: 'npm', args: ['run', 'lint'] },
  {
    name: 'vitest shared с покрытием',
    command: process.execPath,
    args: [VITEST_RATCHET, 'shared'],
  },
  {
    name: 'jest api под TZ=Australia/Sydney',
    command: 'npm',
    args: ['run', 'test', '--workspace=api'],
    env: { TZ: SYDNEY_TZ },
  },
  {
    name: 'vitest web с покрытием',
    command: process.execPath,
    args: [VITEST_RATCHET, 'web'],
  },
  {
    name: 'vitest web под TZ=Australia/Sydney',
    command: 'npm',
    args: ['run', 'test', '--workspace=web'],
    env: { TZ: SYDNEY_TZ },
  },
  { name: 'prettier --check', command: 'npm', args: ['run', 'format:check'] },
  { name: 'e2e api', command: 'npm', args: ['run', 'test:e2e', '--workspace=api'] },
  { name: 'сборка web', command: 'npm', args: ['run', 'build', '--workspace=web'] },
  { name: 'храповики', command: 'npm', args: ['run', 'gates'] },
  { name: 'knip', command: 'npm', args: ['run', 'knip'] },
  { name: 'npm audit', command: process.execPath, args: ['scripts/check-npm-audit.mjs'] },
];

/**
 * Причина падения шага одной строкой по-русски, или `null`, если шаг прошёл.
 * `signal` проверяется РАНЬШЕ `status`: при смерти от сигнала `spawnSync`
 * выставляет `status: null`, и проверка `status !== 0` первой веткой никогда
 * не увидела бы сигнал — тот же баг, из-за которого упавший e2e выглядел
 * зелёным (см. шапку файла).
 */
export function describeExit({ status, signal, error }) {
  if (error) return `не удалось запустить: ${error.message}`;
  if (signal) {
    const memoryHint =
      signal === 'SIGABRT' || signal === 'SIGKILL' ? ' — похоже на нехватку памяти' : '';
    return `убит сигналом ${signal}${memoryHint}`;
  }
  if (status === 0) return null;
  return `код выхода ${status}`;
}

/**
 * Шаги по порядку через `spawnSync` (без shell — `command`/`args` раздельно).
 * Останавливается на первом упавшем шаге и возвращает его вместе с причиной;
 * `null` — все шаги зелёные. `onStep(step, index)` вызывается перед запуском
 * каждого шага — им main() печатает прогресс. `step.stdio` по умолчанию
 * `'inherit'` (шаги check.mjs пишут в терминал как обычно); тестовые
 * шаги-фикстуры задают `'ignore'`, чтобы не шуметь в `node --test`.
 */
export function runSteps(steps, onStep) {
  for (const [index, step] of steps.entries()) {
    onStep?.(step, index);
    const result = spawnSync(step.command, step.args, {
      stdio: step.stdio ?? 'inherit',
      cwd: ROOT,
      env: { ...process.env, ...step.env },
    });
    const reason = describeExit(result);
    if (reason !== null) return { step, reason };
  }
  return null;
}

function main() {
  const failure = runSteps(CHECK_STEPS, (step, index) => {
    console.log(`▶ ${index + 1}/${CHECK_STEPS.length} ${step.name}`);
  });

  if (failure) {
    console.error(`❌ шаг «${failure.step.name}» упал: ${failure.reason}`);
    console.error('Цепочка остановлена, остальные шаги не запускались.');
    // Код 1, а не сигнал/134 упавшего шага: смысл раннера — отдать код,
    // который npm не потеряет (см. шапку файла).
    process.exit(1);
  }

  console.log(`✓ npm run check: все ${CHECK_STEPS.length} шагов зелёные`);
}

// Запуск как самостоятельный скрипт (`npm run check`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
