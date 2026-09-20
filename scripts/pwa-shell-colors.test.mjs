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
// Цвета прежнего направления «тихо и благородно» (ADR-0031) живут здесь
// фикстурой инцидента: оболочка осталась в них, когда кабинет переехал на
// ADR-0043. Вернулся старый цвет — сверка обязана покраснеть.
const ADR_0031_PAPER = '#faf8f4';
const ADR_0031_CINNABAR = '#9c4221';

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
  const problems = findShellColorProblems(
    shell({ indexHtml: `<meta name="theme-color" content="${ADR_0031_PAPER}" />` }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /theme-color в web\/index\.html.*#faf8f4.*#f4f1ea/);
});

test('meta theme-color вообще нет', () => {
  const problems = findShellColorProblems(shell({ indexHtml: '<head></head>' }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /цвет не найден/);
});

test('theme_color манифеста отстал', () => {
  const problems = findShellColorProblems(
    shell({ manifest: { theme_color: ADR_0031_PAPER, background_color: PAPER } }),
  );
  assert.deepEqual(problems, ['theme_color манифеста: #faf8f4, а палитра даёт #f4f1ea']);
});

test('background_color манифеста отстал', () => {
  const problems = findShellColorProblems(
    shell({ manifest: { theme_color: PAPER, background_color: ADR_0031_PAPER } }),
  );
  assert.deepEqual(problems, [
    'background_color манифеста: #faf8f4, а палитра даёт #f4f1ea',
  ]);
});

test('фон иконки отстал от бумаги', () => {
  const problems = findShellColorProblems({
    ...shell(),
    iconSvg: svg(ADR_0031_PAPER, TERRACOTTA),
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /фон web\/public\/icons\/icon\.svg: #faf8f4/);
  // Обводка знака рисуется бумагой — вместе с фоном отстаёт и она.
  assert.match(problems[1], /посторонние цвета в icon\.svg: #faf8f4/);
});

test('знак на иконке не терракотовый', () => {
  const problems = findShellColorProblems({
    ...shell(),
    iconSvg: svg(PAPER, ADR_0031_CINNABAR),
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /знак на icon\.svg: #9c4221.*#b35a38/);
  assert.match(problems[1], /посторонние цвета в icon\.svg: #9c4221/);
});

test('цвет записан в верхнем регистре — то же значение', () => {
  assert.deepEqual(
    findShellColorProblems(
      shell({
        indexHtml: '<meta name="theme-color" content="#F4F1EA" />',
        manifest: { theme_color: '#F4F1EA', background_color: '#f4f1ea' },
        iconSvg: svg('#F4F1EA', '#B35A38'),
      }),
    ),
    [],
  );
});

test('палитра сменилась — сверка идёт за токеном, а не за вчерашним цветом', () => {
  const next = css('#101014', '#2f7a5b');
  const problems = findShellColorProblems(shell({ css: next }));
  assert.equal(problems.length, 6);
  assert.match(problems.join('\n'), /#101014/);

  // Оболочка, перекрашенная вслед за токеном, снова чиста — гейт не держится
  // за сегодняшний цвет.
  assert.deepEqual(
    findShellColorProblems({
      css: next,
      indexHtml: '<meta name="theme-color" content="#101014" />',
      manifest: { theme_color: '#101014', background_color: '#101014' },
      iconSvg: svg('#101014', '#2f7a5b'),
    }),
    [],
  );
});

test('токенов палитры в css нет — одна понятная жалоба', () => {
  assert.deepEqual(findShellColorProblems(shell({ css: ':root { --ink: #24281f; }' })), [
    'в web/src/index.css не нашлись токены --paper и --terracotta',
  ]);
});
