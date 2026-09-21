// Сверка цвета оболочки установленного приложения с палитрой кабинета
// (направление «Тёплая школа», docs/adr/0043). Оболочка — иконка на домашнем
// экране, заставка при запуске и полоска браузера сверху: её человек видит
// раньше любого экрана. Здесь — только бумага (theme-color, цвета манифеста);
// что знак на иконках — тот же файл, что и в кабинете, стережёт отдельная
// проверка scripts/pwa-icon-sources.mjs (docs/adr/0085: знак стал
// фотографией без фиксированной палитры, цвет сверять в нём больше нечего).
//
// Источник правды — токены web/src/index.css, а не зашитый здесь цвет: иначе
// гейт заморозит сегодняшнюю палитру и на следующей смене покраснеет на самой
// смене вместо отставшей оболочки. Именно эту сверку и пропустили при
// переезде на ADR-0043: экраны переезжали по одному PR, а иконка и манифест
// не принадлежат ни одному экрану и остались в цветах ADR-0031.
//
// Гейт, который это вызывает, — scripts/check-pwa.mjs.
const COLOR = '#[0-9a-fA-F]{3,8}';

const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : null);

const tokenOf = (css, name) =>
  lower(new RegExp(`--${name}:\\s*(${COLOR})`).exec(css)?.[1]);

const themeColorOf = (html) =>
  lower(
    new RegExp(`name=["']theme-color["']\\s+content=["'](${COLOR})["']`, 'i').exec(
      html,
    )?.[1],
  );

/**
 * Возвращает список расхождений оболочки с палитрой — по строке на место.
 * Пустой список значит, что бумага совпадает с токеном --paper.
 */
export function findShellColorProblems({ css, indexHtml, manifest }) {
  const paper = tokenOf(css, 'paper');
  if (!paper) return ['в web/src/index.css не нашёлся токен --paper'];

  const problems = [];
  const same = (actual, expected, where) => {
    if (actual !== expected)
      problems.push(
        `${where}: ${actual ?? 'цвет не найден'}, а палитра даёт ${expected}`,
      );
  };
  same(themeColorOf(indexHtml), paper, 'meta theme-color в web/index.html');
  same(lower(manifest.theme_color), paper, 'theme_color манифеста');
  same(lower(manifest.background_color), paper, 'background_color манифеста');
  return problems;
}
