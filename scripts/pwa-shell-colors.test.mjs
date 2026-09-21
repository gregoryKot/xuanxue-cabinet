// Тест на сверку цветов оболочки (CLAUDE.md, гейт «Приложение на телефоне»;
// вызывается из scripts/check-pwa.mjs): фикстуры-строки, не реальные файлы
// репозитория — иначе тест ловит только сегодняшнюю палитру, а не саму
// сверку, и переживёт следующую смену цвета так же молча, как пережил
// переезд на ADR-0043.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findShellColorProblems } from './pwa-shell-colors.mjs';

const PAPER = '#f4f1ea';
// Цвет отставшей оболочки — выдуманный и заведомо не из палитры. Настоящий
// хекс прежнего направления (ADR-0031) взять было нельзя: сверка сравнивает
// с токеном, а не с историей, зато поиск по старому цвету обязан давать по
// репозиторию пусто — иначе фикстуру примут за недочищенный остаток переезда
// на ADR-0043 и «починят».
const OLD_PAPER = '#1b2a4a';
// Палитра следующего направления — любое значение, лишь бы не сегодняшнее.
const NEXT_PAPER = '#101014';

// Токен-сосед с более длинным именем (--paper-shadow) стоит выше нужного:
// сверка обязана различать их по двоеточию, а не по общему началу имени.
const css = (paper = PAPER) => `:root {
  --panel: #f0ece3;
  --paper-shadow: #a65434;
  --paper: ${paper};
  --terracotta: #b35a38;
}`;

const shell = (over = {}) => ({
  css: css(),
  indexHtml: `<meta name="theme-color" content="${PAPER}" />`,
  manifest: { theme_color: PAPER, background_color: PAPER },
  ...over,
});

test('оболочка в цветах палитры — расхождений нет', () => {
  assert.deepEqual(findShellColorProblems(shell()), []);
});

test('meta theme-color отстала от палитры', () => {
  assert.deepEqual(
    findShellColorProblems(
      shell({ indexHtml: `<meta name="theme-color" content="${OLD_PAPER}" />` }),
    ),
    [`meta theme-color в web/index.html: ${OLD_PAPER}, а палитра даёт ${PAPER}`],
  );
});

test('meta theme-color вообще нет', () => {
  assert.deepEqual(findShellColorProblems(shell({ indexHtml: '<head></head>' })), [
    `meta theme-color в web/index.html: цвет не найден, а палитра даёт ${PAPER}`,
  ]);
});

test('theme_color манифеста отстал', () => {
  assert.deepEqual(
    findShellColorProblems(
      shell({ manifest: { theme_color: OLD_PAPER, background_color: PAPER } }),
    ),
    [`theme_color манифеста: ${OLD_PAPER}, а палитра даёт ${PAPER}`],
  );
});

test('background_color манифеста отстал', () => {
  assert.deepEqual(
    findShellColorProblems(
      shell({ manifest: { theme_color: PAPER, background_color: OLD_PAPER } }),
    ),
    [`background_color манифеста: ${OLD_PAPER}, а палитра даёт ${PAPER}`],
  );
});

test('цвет записан в верхнем регистре — то же значение', () => {
  const upperPaper = PAPER.toUpperCase();
  assert.deepEqual(
    findShellColorProblems(
      shell({
        indexHtml: `<meta name="theme-color" content="${upperPaper}" />`,
        manifest: { theme_color: upperPaper, background_color: PAPER },
      }),
    ),
    [],
  );
});

test('палитра сменилась — сверка идёт за токеном, а не за вчерашним цветом', () => {
  const problems = findShellColorProblems(shell({ css: css(NEXT_PAPER) }));
  assert.equal(problems.length, 3);
  assert.equal(
    problems[0],
    `meta theme-color в web/index.html: ${PAPER}, а палитра даёт ${NEXT_PAPER}`,
  );

  // Оболочка, перекрашенная вслед за токеном, снова чиста — гейт не держится
  // за сегодняшний цвет.
  assert.deepEqual(
    findShellColorProblems({
      css: css(NEXT_PAPER),
      indexHtml: `<meta name="theme-color" content="${NEXT_PAPER}" />`,
      manifest: { theme_color: NEXT_PAPER, background_color: NEXT_PAPER },
    }),
    [],
  );
});

test('токена --paper в css нет — одна понятная жалоба', () => {
  assert.deepEqual(findShellColorProblems(shell({ css: ':root { --ink: #24281f; }' })), [
    'в web/src/index.css не нашёлся токен --paper',
  ]);
});
