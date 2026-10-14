// Запуск npm и бинарей пакетов без shell: разбор `bin`, подъём по node_modules,
// ветки npmCommand. Фикстуры — во временном каталоге, поэтому тест одинаков на
// Linux (CI) и Windows (инцидент 2026-10-14: ратчеты не запускались на Windows).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { npmCommand, packageBinCommand } from './tool-command.mjs';

let root;

function addPackage(name, manifest) {
  const dir = join(root, 'node_modules', ...name.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
  return dir;
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'tool-command-'));
  addPackage('str-bin', { bin: 'cli.js' });
  addPackage('obj-bin', { bin: { 'obj-bin': './bin/main.js', other: './bin/other.js' } });
  addPackage('@scope/scoped', { bin: { scoped: 'run.js', extra: 'extra.js' } });
  addPackage('single', { bin: { 'unrelated-name': 'only.js' } });
  addPackage('no-bin', {});
  mkdirSync(join(root, 'api', 'src'), { recursive: true });
});

after(() => rmSync(root, { recursive: true, force: true }));

const binPath = (name, file) => join(root, 'node_modules', ...name.split('/'), file);

test('packageBinCommand: bin-строка → node + абсолютный путь к файлу', () => {
  assert.deepEqual(packageBinCommand('str-bin', ['--x'], { cwd: root }), {
    command: process.execPath,
    args: [binPath('str-bin', 'cli.js'), '--x'],
  });
});

test('packageBinCommand: bin-объект → ключ, равный имени пакета', () => {
  const { args } = packageBinCommand('obj-bin', [], { cwd: root });
  assert.equal(args[0], binPath('obj-bin', join('bin', 'main.js')));
});

test('packageBinCommand: скоуп — имя без @scope/, опция bin выбирает другой ключ', () => {
  assert.equal(
    packageBinCommand('@scope/scoped', [], { cwd: root }).args[0],
    binPath('@scope/scoped', 'run.js'),
  );
  assert.equal(
    packageBinCommand('@scope/scoped', [], { cwd: root, bin: 'extra' }).args[0],
    binPath('@scope/scoped', 'extra.js'),
  );
});

test('packageBinCommand: единственный bin выбирается, даже если имя другое', () => {
  assert.equal(
    packageBinCommand('single', [], { cwd: root }).args[0],
    binPath('single', 'only.js'),
  );
});

test('packageBinCommand: cwd вложен глубже — поднимается к корневому node_modules', () => {
  const { args } = packageBinCommand('str-bin', [], { cwd: join(root, 'api', 'src') });
  assert.equal(args[0], binPath('str-bin', 'cli.js'));
});

test('packageBinCommand: пакета нет → понятная ошибка по-русски', () => {
  assert.throws(
    () => packageBinCommand('missing-pkg-xyz', [], { cwd: root }),
    /missing-pkg-xyz.*npm ci/,
  );
});

test('packageBinCommand: у пакета нет bin или нужного ключа → ошибка', () => {
  assert.throws(() => packageBinCommand('no-bin', [], { cwd: root }), /no-bin/);
  assert.throws(
    () => packageBinCommand('obj-bin', [], { cwd: root, bin: 'nope' }),
    /obj-bin/,
  );
});

test('npmCommand: npm_execpath задан → node + npm-cli первым аргументом', () => {
  assert.deepEqual(npmCommand(['audit'], { npm_execpath: '/x/npm-cli.js' }), {
    command: process.execPath,
    args: ['/x/npm-cli.js', 'audit'],
  });
});

test('npmCommand: без npm_execpath, но npm-cli.js лежит рядом с node → node + он', () => {
  const nodeDir = join(root, 'fake-node');
  const cli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  mkdirSync(join(cli, '..'), { recursive: true });
  writeFileSync(cli, '');
  assert.deepEqual(npmCommand(['ci'], {}, nodeDir), {
    command: process.execPath,
    args: [cli, 'ci'],
  });
});

test('npmCommand: ничего не нашлось → голый npm', () => {
  assert.deepEqual(npmCommand(['ci'], {}, join(root, 'empty-dir')), {
    command: 'npm',
    args: ['ci'],
  });
});
