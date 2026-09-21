// Тест на сверку цветов оболочки (CLAUDE.md, гейт «Приложение на телефоне»;
// вызывается из scripts/check-pwa.mjs): фикстуры-строки, не реальные файлы
// репозитория — иначе тест ловит только сегодняшнюю палитру, а не саму
// сверку, и переживёт следующую смену цвета так же молча, как пережил
// переезд на ADR-0043.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findShellColorProblems } from './pwa-shell-colors.mjs';

const PAPER = '#f4f1ea';
const TERRACOTTA = '#b35a38';
// Цвета отставшей оболочки — выдуманные и заведомо не из палитры. Настоящие
// хексы прежнего направления (ADR-0031) взять было нельзя: сверка сравнивает
// с токеном, а не с историей, зато поиск по старому цвету обязан давать по
// репозиторию пусто — иначе фикстуру примут за недочищенный остаток переезда
// на ADR-0043 и «починят».
const OLD_PAPER = '#1b2a4a';
const OLD_MARK = '#0f766e';
// Палитра следующего направления: любая пара, лишь бы не сегодняшняя.
const NEXT_PAPER = '#101014';
const NEXT_MARK = '#2f7a5b';

// Токен-сосед с более длинным именем (--terracotta-text) стоит выше нужного:
// сверка обязана различать их по двоеточию, а не по началу имени.
const css = (paper = PAPER, terracotta = TERRACOTTA) => `:root {
  --panel: #f0ece3;
  --terracotta-text: #a65434;
  --paper: ${paper};
  --terracotta: ${terracotta};
}`;

const svg = (background, mark, stroke = background) =>
  `<svg><rect fill="${background}" />` +
  `<rect fill="${mark}" stroke="${stroke}" stroke-width="6" /></svg>`;

const shell = (over = {}) => ({
  css: css(),
  indexHtml: `<meta name="theme-color" content="${PAPER}" />`,
  manifest: { theme_color: PAPER, background_color: PAPER },
  iconSvg: svg(PAPER, TERRACOTTA),
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

test('фон иконки отстал от бумаги', () => {
  // Обводка знака рисуется бумагой — вместе с фоном отстаёт и она, отсюда
  // вторая жалоба.
  assert.deepEqual(
    findShellColorProblems({ ...shell(), iconSvg: svg(OLD_PAPER, TERRACOTTA) }),
    [
      `фон web/public/icons/icon.svg: ${OLD_PAPER}, а палитра даёт ${PAPER}`,
      `посторонние цвета в icon.svg: ${OLD_PAPER}`,
    ],
  );
});

test('знак на иконке не терракотовый', () => {
  assert.deepEqual(
    findShellColorProblems({ ...shell(), iconSvg: svg(PAPER, OLD_MARK) }),
    [
      `знак на icon.svg: ${OLD_MARK}, ${PAPER}, а палитра даёт ${TERRACOTTA}`,
      `посторонние цвета в icon.svg: ${OLD_MARK}`,
    ],
  );
});

test('цвет записан в верхнем регистре — то же значение', () => {
  const upperPaper = PAPER.toUpperCase();
  assert.deepEqual(
    findShellColorProblems(
      shell({
        indexHtml: `<meta name="theme-color" content="${upperPaper}" />`,
        manifest: { theme_color: upperPaper, background_color: PAPER },
        iconSvg: svg(upperPaper, TERRACOTTA.toUpperCase()),
      }),
    ),
    [],
  );
});

test('палитра сменилась — сверка идёт за токеном, а не за вчерашним цветом', () => {
  const next = css(NEXT_PAPER, NEXT_MARK);
  const problems = findShellColorProblems(shell({ css: next }));
  assert.equal(problems.length, 6);
  assert.equal(
    problems[0],
    `meta theme-color в web/index.html: ${PAPER}, а палитра даёт ${NEXT_PAPER}`,
  );

  // Оболочка, перекрашенная вслед за токеном, снова чиста — гейт не держится
  // за сегодняшний цвет.
  assert.deepEqual(
    findShellColorProblems({
      css: next,
      indexHtml: `<meta name="theme-color" content="${NEXT_PAPER}" />`,
      manifest: { theme_color: NEXT_PAPER, background_color: NEXT_PAPER },
      iconSvg: svg(NEXT_PAPER, NEXT_MARK),
    }),
    [],
  );
});

test('токенов палитры в css нет — одна понятная жалоба', () => {
  assert.deepEqual(findShellColorProblems(shell({ css: ':root { --ink: #24281f; }' })), [
    'в web/src/index.css не нашлись токены --paper и --terracotta',
  ]);
});
