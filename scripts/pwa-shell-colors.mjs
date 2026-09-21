// Сверка цвета оболочки установленного приложения с палитрой кабинета
// (направление «Тёплая школа», docs/adr/0043). Оболочка — иконка на домашнем
// экране, заставка при запуске и полоска браузера сверху: её человек видит
// раньше любого экрана, и знак школы там обязан совпадать со знаком внутри,
// иначе он не узнаёт то же место.
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

const colorsOf = (svg) =>
  [...svg.matchAll(new RegExp(`(?:fill|stroke)="(${COLOR})"`, 'g'))].map((m) =>
    m[1].toLowerCase(),
  );

/**
 * Возвращает список расхождений оболочки с палитрой — по строке на место.
 * Пустой список значит, что бумага и знак совпадают с токенами.
 */
export function findShellColorProblems({ css, indexHtml, manifest, iconSvg }) {
  const paper = tokenOf(css, 'paper');
  const terracotta = tokenOf(css, 'terracotta');
  if (!paper || !terracotta)
    return ['в web/src/index.css не нашлись токены --paper и --terracotta'];

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

  // Первый цвет svg — заливка фонового прямоугольника, остальные принадлежат
  // знаку: заливка терракотой и светлая обводка бумагой.
  const [background, ...mark] = colorsOf(iconSvg);
  same(background, paper, 'фон web/public/icons/icon.svg');
  if (!mark.includes(terracotta))
    problems.push(
      `знак на icon.svg: ${mark.join(', ') || 'цвет не найден'}, ` +
        `а палитра даёт ${terracotta}`,
    );
  const alien = mark.filter((color) => color !== paper && color !== terracotta);
  if (alien.length) problems.push(`посторонние цвета в icon.svg: ${alien.join(', ')}`);
  return problems;
}
