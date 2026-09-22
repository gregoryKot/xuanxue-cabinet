// Тест на разбор check-control-font-size.mjs (CLAUDE.md, храповик
// «check-control-font-size.mjs», docs/adr/0109): фикстуры-строки, не
// реальное дерево web/src — та же логика, что у
// check-card-list-gap.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasControlFontSizeRule,
  findInlineControlFontFindings,
} from './check-control-font-size.mjs';

// --- hasControlFontSizeRule ---

test('CSS-правило есть, кегль ≥16px — засчитывается', () => {
  const css = 'input,\ntextarea,\nselect {\n  font-size: 16px;\n}';
  assert.equal(hasControlFontSizeRule(css), true);
});

test('кегль меньше 16px — не засчитывается', () => {
  assert.equal(
    hasControlFontSizeRule('input, textarea, select { font-size: 15px; }'),
    false,
  );
});

test('не хватает одного из трёх селекторов — не засчитывается', () => {
  assert.equal(hasControlFontSizeRule('input, textarea { font-size: 16px; }'), false);
});

test('правило внутри /* … */ не считается', () => {
  assert.equal(
    hasControlFontSizeRule('/* input, textarea, select { font-size: 16px; } */'),
    false,
  );
});

test('лишний селектор в списке не мешает — три обязательных на месте', () => {
  assert.equal(
    hasControlFontSizeRule('input, textarea, select, button { font-size: 16px; }'),
    true,
  );
});

// --- findInlineControlFontFindings: прямой инлайн ---

test('инлайн-объект с fontSize на input ловится', () => {
  const files = {
    'web/src/a/A.tsx': 'export const A = () => <input style={{ fontSize: 14 }} />;',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].tag, 'input');
  assert.equal(findings[0].style, 'инлайн-объект');
});

test('инлайн font (шорткод) на textarea ловится', () => {
  const files = {
    'web/src/a/A.tsx': "<textarea style={{ font: '13px sans-serif' }} />",
  };
  assert.equal(findInlineControlFontFindings(files).length, 1);
});

test('fontFamily не размер — не ловится', () => {
  const files = { 'web/src/a/A.tsx': "<input style={{ fontFamily: 'monospace' }} />" };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('select без font — чисто', () => {
  const files = { 'web/src/a/A.tsx': "<select style={{ width: '100%' }} />" };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('div не контрол — не проверяется вовсе', () => {
  const files = { 'web/src/a/A.tsx': '<div style={{ fontSize: 14 }} />' };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('номер строки — по позиции самого тега', () => {
  const src = [
    'import { Field } from "../components/Field";',
    '',
    'export function A() {',
    '  return (',
    '    <input style={{ fontSize: 14 }} />',
    '  );',
    '}',
  ].join('\n');
  const findings = findInlineControlFontFindings({ 'web/src/a/A.tsx': src });
  assert.equal(findings[0].line, 5);
});

test('многострочный тег со стрелкой в обработчике не сбивает разбор конца тега', () => {
  const src = [
    '<input',
    '  onChange={(e) => onChange(e.target.value)}',
    '  style={{ fontSize: 14 }}',
    '/>',
  ].join('\n');
  assert.equal(findInlineControlFontFindings({ 'web/src/a/A.tsx': src }).length, 1);
});

// --- резолвер имени: в том же файле ---

test('именованный стиль в том же файле с font — ловится по имени', () => {
  const files = {
    'web/src/a/A.tsx': 'const badStyle = { fontSize: 14 };\n<input style={badStyle} />;',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].style, 'badStyle');
});

test('именованный стиль в том же файле без font — чисто', () => {
  const files = {
    'web/src/a/A.tsx': 'const okStyle = { width: 90 };\n<input style={okStyle} />;',
  };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('спред на именованный стиль с font — раскрывается и ловится', () => {
  const files = {
    'web/src/a/A.tsx':
      'const base = { fontSize: 20 };\n' +
      'const wide = { ...base, width: 200 };\n' +
      '<input style={wide} />;',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].style, 'wide');
});

// Первая версия гейта видела только запись, начинающуюся со свойства: маска
// комментария оставляет `//`, и `fontSize` под комментарием проходил мимо —
// на живом getInputStyle(), где под комментарием стоит каждое второе свойство
// (проверка 2026-09-22, до мержа).

test('font под строкой-комментарием внутри литерала — ловится', () => {
  const files = {
    'web/src/a/A.tsx':
      'const badStyle = {\n' +
      '  // почему тут кегль\n' +
      '  fontSize: 14,\n' +
      '  width: 90,\n' +
      '};\n' +
      '<input style={badStyle} />;',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].style, 'badStyle');
});

test('спред под строкой-комментарием — раскрывается и ловится', () => {
  const files = {
    'web/src/a/A.tsx':
      "const base = { font: 'inherit' };\n" +
      'const wide = {\n' +
      '  // почему берём базовый стиль\n' +
      '  ...base,\n' +
      '  width: 200,\n' +
      '};\n' +
      '<input style={wide} />;',
  };
  assert.equal(findInlineControlFontFindings(files).length, 1);
});

test('стрелка (…) => ({ … }) с font — ловится', () => {
  const files = {
    'web/src/a/A.tsx':
      'const arrowStyle = () => ({ fontSize: 18 });\n' +
      '<textarea style={arrowStyle()} />;',
  };
  assert.equal(findInlineControlFontFindings(files).length, 1);
});

test('вызов функции, возвращающей литерал без font — чисто', () => {
  const files = {
    'web/src/a/A.tsx':
      'export function getStyle(size) {\n  return { width: size };\n}\n' +
      "<input style={getStyle('large')} />;",
  };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('вызов функции, возвращающей литерал с font — ловится, имя — сам вызов', () => {
  const files = {
    'web/src/a/A.tsx':
      'export function getStyle(size) {\n  return { fontSize: size };\n}\n' +
      '<input style={getStyle(20)} />;',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].style, 'getStyle(20)');
});

// --- резолвер имени: один переход по относительному импорту ---

test('импортированный стиль с font — ловится через один переход', () => {
  const files = {
    'web/src/a/A.tsx':
      "import { sharedStyle } from '../shared/style';\n<input style={sharedStyle} />;",
    'web/src/shared/style.ts': 'export const sharedStyle = { fontSize: 12 };',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].style, 'sharedStyle');
});

test('импортированный стиль без font — чисто', () => {
  const files = {
    'web/src/a/A.tsx':
      "import { sharedStyle } from '../shared/style';\n<input style={sharedStyle} />;",
    'web/src/shared/style.ts': 'export const sharedStyle = { width: 90 };',
  };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('сценарий getInputStyle(size): вызов импортированной функции без font — чисто', () => {
  const files = {
    'web/src/comp/Select.tsx':
      "import { getInputStyle } from './Field';\n" +
      "<select style={getInputStyle('large')} />;",
    'web/src/comp/Field.tsx':
      'export function getInputStyle(size) {\n' +
      "  return { minHeight: size === 'large' ? 48 : 44 };\n}",
  };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('сценарий getInputStyle(size): та же функция с font — ловится', () => {
  const files = {
    'web/src/comp/Select.tsx':
      "import { getInputStyle } from './Field';\n" +
      "<select style={getInputStyle('large')} />;",
    'web/src/comp/Field.tsx':
      'export function getInputStyle(size) {\n  return { fontSize: 16 };\n}',
  };
  const findings = findInlineControlFontFindings(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].tag, 'select');
});

test('цепочка в два перехода через импорт не разрешается — гейт молчит о непонятом', () => {
  const files = {
    'web/src/a/A.tsx':
      "import { midStyle } from '../mid/style';\n<input style={midStyle} />;",
    'web/src/mid/style.ts':
      "import { farStyle } from '../far/style';\nexport const midStyle = farStyle;",
    'web/src/far/style.ts': 'export const farStyle = { fontSize: 30 };',
  };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('импорт без цели в карте файлов — не разрешается, не падает', () => {
  const files = {
    'web/src/a/A.tsx':
      "import { unknownStyle } from '../nowhere/style';\n" +
      '<input style={unknownStyle} />;',
  };
  assert.deepEqual(findInlineControlFontFindings(files), []);
});

test('циклическая ссылка на себя не зацикливает гейт', () => {
  const files = {
    'web/src/a/A.tsx':
      'const cyclic = { ...cyclic, width: 10 };\n<input style={cyclic} />;',
  };
  assert.doesNotThrow(() => findInlineControlFontFindings(files));
  assert.deepEqual(findInlineControlFontFindings(files), []);
});
