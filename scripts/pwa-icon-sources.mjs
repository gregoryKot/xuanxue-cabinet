// Сверка «знак школы везде один» (docs/adr/0084, CLAUDE.md «Отказались от
// механики — удаляем с концами»): раньше это стерегла цветовая сверка в
// pwa-shell-colors.mjs (прежний векторный знак против токенов
// --paper/--terracotta). Знак стал фотографией печати без фиксированной
// палитры — цвет сверять больше нечем, вместо этого сверяем сам файл: источник
// web/brand/school-mark.webp,
// бейслайн scripts/pwa-icons-baseline.json (пишет scripts/generate-pwa-icons.mjs),
// собранные иконки и компонент, который показывает знак в интерфейсе
// (web/src/components/SchoolMark.tsx).
//
// findIconSourceProblems — чистая функция: принимает уже прочитанные данные,
// а не пути, поэтому тестируется фикстурами-строками
// (scripts/pwa-icon-sources.test.mjs) без реальных файлов репозитория.
// collectIconSourceProblems внизу — тонкая обвязка поверх нужных файлов для
// scripts/check-pwa.mjs, без своих тестов: файловый ввод/вывод проверяет сам
// прогон гейта (тем самым check-pwa.mjs не пухнет ради чтения пяти файлов).
import { existsSync, readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export const REGENERATE_HINT = 'node scripts/generate-pwa-icons.mjs';

const PAPER_TOKEN = /--paper:\s*(#[0-9a-fA-F]{3,8})/;
// /icons/<файл>.png без ведущего слеша — тем же видом, что элементы outputs
// бейслайна, сравнение обходится без нормализации пути.
const ICON_PATH_IN_SOURCE = /icons\/[\w.-]+\.png/;

/**
 * Возвращает список расхождений — по строке на каждое. Пустой список значит,
 * что знак на входе, в кабинете и на иконках — один и тот же файл.
 */
export function findIconSourceProblems({
  css,
  sourceExists,
  sourceSha256,
  baseline,
  publicIconFiles,
  distIconFiles,
  schoolMarkTsx,
}) {
  if (!sourceExists) return [`web/brand/school-mark.webp не найден — знак нечем собрать`];
  if (!baseline)
    return [
      `scripts/pwa-icons-baseline.json не читается — собери иконки: ${REGENERATE_HINT}`,
    ];

  const problems = [];
  if (baseline.sourceSha256 !== sourceSha256)
    problems.push(
      'web/brand/school-mark.webp изменился, а иконки — нет: sha256 не совпадает с ' +
        `бейслайном. Перегенерируй: ${REGENERATE_HINT}`,
    );

  const paper = PAPER_TOKEN.exec(css)?.[1];
  if (!paper) problems.push('в web/src/index.css не нашёлся токен --paper');
  else if (baseline.background !== paper)
    problems.push(
      `фон иконок в бейслайне (${baseline.background ?? 'не задан'}) разошёлся с токеном ` +
        `--paper (${paper}). Перегенерируй: ${REGENERATE_HINT}`,
    );

  const outputs = Array.isArray(baseline.outputs) ? baseline.outputs : [];
  for (const output of outputs) {
    const file = output.replace(/^icons\//, '');
    if (!publicIconFiles.includes(file))
      problems.push(`${output} из бейслайна нет в web/public/icons. ${REGENERATE_HINT}`);
    if (!distIconFiles.includes(file))
      problems.push(`${output} не попал в сборку web/dist — собери web заново`);
  }

  const markPath = ICON_PATH_IN_SOURCE.exec(schoolMarkTsx)?.[0];
  if (!markPath)
    problems.push(
      'web/src/components/SchoolMark.tsx не ссылается на файл из web/public/icons — ' +
        'знак в интерфейсе не из общего источника',
    );
  else if (!outputs.includes(markPath))
    problems.push(
      `web/src/components/SchoolMark.tsx ссылается на ${markPath}, которого нет среди ` +
        `outputs бейслайна — ${REGENERATE_HINT}, затем поправь путь в SchoolMark.tsx`,
    );

  return problems;
}

/** Имена png прямо в каталоге — иконки лежат плоско, разбирать дерево незачем. */
function pngNamesIn(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.png'));
  } catch {
    return [];
  }
}

/**
 * Читает источник, бейслайн, собранные иконки и SchoolMark.tsx с диска и
 * зовёт findIconSourceProblems. `css` уже прочитан вызывающим (check-pwa.mjs
 * читает web/src/index.css и для findShellColorProblems тоже — незачем читать
 * файл дважды).
 */
export function collectIconSourceProblems({ root, dist, css }) {
  const sourcePath = join(root, 'web', 'brand', 'school-mark.webp');
  const sourceExists = existsSync(sourcePath);

  let baseline = null;
  try {
    baseline = JSON.parse(
      readFileSync(join(root, 'scripts', 'pwa-icons-baseline.json'), 'utf8'),
    );
  } catch {
    // остаётся null — жалобу даёт сама findIconSourceProblems; это не
    // аварийный выход, остальные проверки check-pwa.mjs всё равно интересны.
  }

  let schoolMarkTsx = '';
  try {
    schoolMarkTsx = readFileSync(
      join(root, 'web', 'src', 'components', 'SchoolMark.tsx'),
      'utf8',
    );
  } catch {
    // остаётся '' — findIconSourceProblems сам пожалуется на пустую ссылку.
  }

  return findIconSourceProblems({
    css,
    sourceExists,
    sourceSha256: sourceExists
      ? createHash('sha256').update(readFileSync(sourcePath)).digest('hex')
      : null,
    baseline,
    publicIconFiles: pngNamesIn(join(root, 'web', 'public', 'icons')),
    distIconFiles: pngNamesIn(join(dist, 'icons')),
    schoolMarkTsx,
  });
}
