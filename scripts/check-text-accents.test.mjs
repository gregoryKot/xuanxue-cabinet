// Тест на разбор scripts/text-accents-scan.mjs, который использует храповик
// check-text-accents.mjs: фикстуры-строки, не реальное дерево репозитория —
// иначе тест ловит только сегодняшнее состояние файлов, а не разбор.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectTextUnits,
  isFlatParagraph,
  findStrayMarks,
  findForbiddenMarks,
  FLAT_PARAGRAPH_MIN_LENGTH,
} from './text-accents-scan.mjs';

// Кириллический текст ровно на пороге и выше него — helper строит строку
// нужной длины с пробелами внутри (иначе один сплошной кусок без пробела не
// прошёл бы фильтр isUserFacingText).
function cyrillicText(length) {
  const words = 'урок занятие расписание учитель ученик оплата абонемент время'.split(
    ' ',
  );
  let text = '';
  while (text.length < length) {
    text += `${words[text.length % words.length]} `;
  }
  return text.slice(0, length);
}

test('длинная строка без маркера ловится как плоский абзац', () => {
  const long = cyrillicText(FLAT_PARAGRAPH_MIN_LENGTH);
  const src = `const message = '${long}';`;
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 1);
  assert.equal(isFlatParagraph(units[0]), true);
});

test('та же строка с **…** проходит — акцент есть', () => {
  const long = cyrillicText(FLAT_PARAGRAPH_MIN_LENGTH);
  const withMark = `${long.slice(0, 10)}**${long.slice(10, 20)}**${long.slice(20)}`;
  const src = `const message = '${withMark}';`;
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 1);
  assert.equal(isFlatParagraph(units[0]), false);
});

test('короткая строка без маркера не считается плоским абзацем', () => {
  const src = "const label = 'Записаться на занятие';";
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 1);
  assert.ok(units[0].text.length < FLAT_PARAGRAPH_MIN_LENGTH);
  assert.equal(isFlatParagraph(units[0]), false);
});

test('JSX-текст, растянутый на несколько строк, собирается в одну единицу', () => {
  const src = [
    'function Hint() {',
    '  return (',
    '    <p>',
    '      Первая часть длинного пояснения для ученика, которое',
    '      растягивается на несколько строк исходника ради теста.',
    '    </p>',
    '  );',
    '}',
  ].join('\n');
  const units = collectTextUnits('a.tsx', src);
  assert.equal(units.length, 1);
  assert.ok(units[0].text.includes('Первая часть'));
  assert.ok(units[0].text.includes('ради теста.'));
  assert.ok(!units[0].text.includes('\n'));
});

test('шаблонная строка с подстановкой собирается в одну единицу', () => {
  const src =
    'const text = `Занятие начнётся через ${minutes} минут, приходите пораньше`;';
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 1);
  assert.ok(units[0].text.startsWith('Занятие начнётся через …'));
  assert.ok(units[0].text.endsWith('приходите пораньше'));
});

test('непарный маркер ловится', () => {
  const units = [{ file: 'a.ts', line: 1, text: 'Мы сделаем **это** и вот **это тоже' }];
  const stray = findStrayMarks(units);
  assert.equal(stray.length, 1);
});

test('парный маркер не считается непарным', () => {
  const units = [
    { file: 'a.ts', line: 1, text: 'Мы сделаем **это** и вот **это тоже**' },
  ];
  assert.deepEqual(findStrayMarks(units), []);
});

test('строка без кириллицы игнорируется', () => {
  const src = "const cls = 'flex items-center justify-between gap-2';";
  const units = collectTextUnits('a.ts', src);
  assert.deepEqual(units, []);
});

test('строка с кириллицей, но без пробела, игнорируется', () => {
  const src = "const status = 'оплачено';";
  const units = collectTextUnits('a.ts', src);
  assert.deepEqual(units, []);
});

test('findForbiddenMarks: маркер в единице ловится', () => {
  const units = [
    { file: 'api/src/a.ts', line: 1, text: 'Занятие **сегодня** в 19:00' },
    { file: 'api/src/b.ts', line: 1, text: 'Занятие сегодня в 19:00' },
  ];
  const forbidden = findForbiddenMarks(units);
  assert.equal(forbidden.length, 1);
  assert.equal(forbidden[0].file, 'api/src/a.ts');
});

test('номер строки — по узлу, для JSX учитывает перенос', () => {
  const src = [
    'const A = 1;',
    "const b = 'Запись на занятие подтверждена, ждём вас';",
  ].join('\n');
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 1);
  assert.equal(units[0].line, 2);
});

// Длинный абзац в кабинете почти всегда записан склейкой через `+` (prettier
// переносит строку) — по кускам он до порога не дотягивает ни разу, и без
// этой сборки гейт не видел бы как раз самые длинные тексты.
test('склейка литералов через + — одна единица целиком, без двойного счёта', () => {
  const src = [
    'const EXPLANATION =',
    "  'Выберите экзамен и нажмите «Начать». У экзамена бывает срок — тогда ' +",
    "  'часы идут без остановки, даже если вы закрыли вкладку.';",
  ].join('\n');
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 1);
  assert.ok(units[0].text.startsWith('Выберите экзамен'));
  assert.ok(units[0].text.endsWith('закрыли вкладку.'));
  assert.equal(isFlatParagraph(units[0]), true);
});

test('склейка с переменной собирается по кускам, а не целиком', () => {
  const src = [
    'const NAME = получитьИмя();',
    "const TEXT = 'Занятие ведёт ' + NAME + ', начало в 19:00 по Иерусалиму';",
  ].join('\n');
  const units = collectTextUnits('a.ts', src);
  assert.equal(units.length, 2);
  assert.deepEqual(
    units.map((u) => u.text),
    ['Занятие ведёт ', ', начало в 19:00 по Иерусалиму'],
  );
});
