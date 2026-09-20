// Тест на check.mjs (раннер `npm run check`, CLAUDE.md «Ничего не мержится с
// красным CI»): describeExit разбирается на фикстурах-объектах {status,
// signal, error}, runSteps — на шагах-фикстурах (process.execPath с `-e`), а
// не на реальной цепочке check — иначе тест сам займёт 10+ минут и будет
// ловить состояние окружения, а не логику раннера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_STEPS, describeExit, runSteps } from './check.mjs';

test('describeExit: успешный шаг → null', () => {
  assert.equal(describeExit({ status: 0, signal: null, error: null }), null);
});

test('describeExit: код выхода 1 → строка с кодом выхода', () => {
  const reason = describeExit({ status: 1, signal: null, error: null });
  assert.match(reason, /1/);
});

test('describeExit: SIGABRT при status:null — регрессия «упавший e2e выглядел зелёным»', () => {
  const reason = describeExit({ status: null, signal: 'SIGABRT', error: null });
  assert.match(reason, /SIGABRT/);
  assert.match(reason, /памят/);
});

test('describeExit: error (процесс не запустился) → текст ошибки', () => {
  const reason = describeExit({
    status: null,
    signal: null,
    error: new Error('spawn xyz ENOENT'),
  });
  assert.match(reason, /spawn xyz ENOENT/);
});

// Шаги-фикстуры: process.execPath с `-e` вместо реальных npm-команд — быстро
// и без побочных эффектов; stdio: 'ignore', чтобы падение/успех фикстуры не
// шумели в выводе `node --test`.
const okStep = (name) => ({
  name,
  command: process.execPath,
  args: ['-e', ''],
  stdio: 'ignore',
});
const crashStep = {
  name: 'падает от сигнала',
  command: process.execPath,
  args: ['-e', 'process.abort()'],
  stdio: 'ignore',
};

test('runSteps: останавливается на шаге, упавшем от сигнала, дальше не идёт', () => {
  const started = [];
  const steps = [okStep('шаг 1'), crashStep, okStep('шаг после сигнала')];

  const result = runSteps(steps, (step) => started.push(step.name));

  assert.deepEqual(started, ['шаг 1', 'падает от сигнала']);
  assert.equal(result.step, crashStep);
  assert.match(result.reason, /SIGABRT/);
});

test('runSteps: все шаги-фикстуры зелёные → null', () => {
  const steps = [okStep('шаг 1'), okStep('шаг 2'), okStep('шаг 3')];
  assert.equal(runSteps(steps), null);
});

test('CHECK_STEPS: у каждого шага непустые name, command и args', () => {
  assert.ok(CHECK_STEPS.length > 0, 'список шагов пуст');
  for (const step of CHECK_STEPS) {
    assert.equal(typeof step.name, 'string');
    assert.ok(step.name.length > 0, 'у шага пустое name');
    assert.equal(typeof step.command, 'string');
    assert.ok(step.command.length > 0, 'у шага пустой command');
    assert.ok(Array.isArray(step.args) && step.args.length > 0, 'у шага пустой args');
  }
});

// Шаг, ради которого раннер и появился (ADR-0076): именно на нём цепочка
// умирала от сигнала и выглядела зелёной.
test('CHECK_STEPS: e2e api остался в списке', () => {
  const e2e = CHECK_STEPS.find((step) => step.args.includes('test:e2e'));
  assert.ok(e2e, 'шаг e2e пропал из npm run check');
  assert.deepEqual(e2e.args, ['run', 'test:e2e', '--workspace=api']);
});
