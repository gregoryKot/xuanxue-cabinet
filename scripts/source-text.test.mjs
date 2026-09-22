// Тесты общего сканера исходника (scripts/source-text.mjs). Фикстуры —
// строки, не дерево репозитория: проверяется разбор, а не сегодняшний код.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripComments, stripLiterals } from './source-text.mjs';

test('stripComments: строчный комментарий гасится, длина строки та же', () => {
  const src = "const a = 1; // @Controller('x')\nconst b = 2;";
  const out = stripComments(src);
  assert.equal(out.length, src.length);
  assert.ok(!out.includes('@Controller'));
  assert.ok(out.startsWith('const a = 1; '));
  assert.ok(out.endsWith('\nconst b = 2;'));
});

test('stripComments: блочный комментарий гасится, переводы строк на месте', () => {
  const src = "/**\n * @Controller()\n */\n@Controller('auth')";
  const out = stripComments(src);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.equal(out.trim(), "@Controller('auth')");
});

test('stripComments: аргумент строки остаётся — по нему читают префикс', () => {
  assert.equal(stripComments("@Controller('auth')"), "@Controller('auth')");
});

test('stripComments: `//` внутри строки — не комментарий', () => {
  const src = "const url = 'https://example.com/x'; const a = 1;";
  assert.equal(stripComments(src), src);
});

test('stripLiterals: содержимое строки гасится, кавычки остаются', () => {
  const body = 'текст со скобкой (';
  const src = `it('${body}', fn)`;
  assert.equal(stripLiterals(src), `it('${' '.repeat(body.length)}', fn)`);
});

test('stripLiterals: шаблон с подстановкой и скобками не ломает баланс', () => {
  const src = 'fetch(`${base}/a?b=(c)`, init)';
  const out = stripLiterals(src);
  assert.equal(out.length, src.length);
  assert.equal(out, `fetch(\`${' '.repeat('${base}/a?b=(c)'.length)}\`, init)`);
  const opens = [...out].filter((c) => c === '(').length;
  const closes = [...out].filter((c) => c === ')').length;
  assert.equal(opens, closes);
});

test('stripLiterals: экранированная кавычка не закрывает литерал', () => {
  const out = stripLiterals("const s = 'a\\'b('; const t = 1;");
  assert.ok(out.endsWith("'; const t = 1;"));
  assert.ok(!out.includes('('));
});

test('stripLiterals: незакрытый литерал не роняет сканер', () => {
  assert.equal(stripLiterals("const s = 'abc"), "const s = '   ");
});

test('stripLiterals: комментарий тоже гасится', () => {
  const out = stripLiterals('// it.only(\nconst a = 1;');
  assert.ok(!out.includes('it.only'));
  assert.ok(out.endsWith('\nconst a = 1;'));
});

test('оба сканера сохраняют номера строк', () => {
  const src = "/* a\nb */ 'c\nd'\n// e\nконец";
  for (const out of [stripComments(src), stripLiterals(src)]) {
    assert.equal(out.split('\n').length, src.split('\n').length);
    assert.equal(out.length, src.length);
  }
});
