// Картинка превью ссылки — web/public/og-cover.png, её показывают мессенджеры
// и соцсети рядом с адресом кабинета (теги Open Graph в web/index.html,
// ADR-0117). Рисуется тем же скриптом и из того же знака, что иконки
// (scripts/generate-pwa-icons.mjs, ADR-0085): печать на бумаге `--paper`, под
// ней название школы и строка о том, что внутри.
//
// Композиция — колонка по центру, и всё содержимое умещается в средний
// квадрат 630×630: часть мессенджеров показывает превью квадратом, и такой
// кроп не режет ни печать, ни строки.
//
// sharp сюда передаётся параметром — грузит его scripts/brand-fonts.mjs, и
// только он: статический `import sharp` поднял бы fontconfig раньше, чем
// встанет FONTCONFIG_FILE, и текст вышел бы плашками (причина — там же).
import { readFileSync } from 'fs';

/** Размер картинки. Те же числа стоят в og:image:width/height — расхождение
 * ловит scripts/pwa-preview-meta.mjs, сверяя теги с заголовком самого PNG. */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;

const SEAL_SIZE = 300;
const SEAL_TOP = 92;
const TITLE_BASELINE = 464;
const TITLE_SIZE = 54;
const SUBTITLE_BASELINE = 518;
const SUBTITLE_SIZE = 28;
// Начертания — те же, что у названия школы в кабинете (SchoolWordmark.tsx).
const TITLE_WEIGHT = 500;
// Минус полпикселя на знак: на кегле 54 Golos Text без этого набирается чуть
// разреженно для заголовка такой длины.
const TITLE_TRACKING = -0.5;

// Что человек узнаёт из превью сверх названия. Коротко: строку показывают
// уменьшенной до ширины пузыря в переписке (docs/VOICE.md — конкретика).
const SUBTITLE = 'Расписание, занятия и записи';

/**
 * Название школы берётся из самого кабинета, а не пишется здесь второй раз:
 * SchoolWordmark.tsx — единственное место, где оно объявлено (CLAUDE.md,
 * «Повторяющийся текст пользователю — тоже константа»).
 */
export function readSchoolName(wordmarkTsx) {
  const match = /const SCHOOL_NAME = '([^']+)'/.exec(wordmarkTsx);
  if (!match)
    throw new Error(
      'в web/src/components/SchoolWordmark.tsx не нашлась константа SCHOOL_NAME',
    );
  return match[1];
}

/** Экранирование для текста внутри SVG — название и подпись попадают в разметку. */
function escapeXml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

/**
 * Рисует превью и кладёт его в outFile.
 * @param {object} options
 * @param {import('sharp')} options.sharp — из loadSharpWithBrandFonts()
 * @param {string} options.sourcePath — web/brand/school-mark.webp
 * @param {string} options.wordmarkPath — web/src/components/SchoolWordmark.tsx
 * @param {{paper: string, ink: string, inkSoft: string}} options.colors — токены index.css
 * @param {string} options.fontFamily — BRAND_FONT_FAMILY
 * @param {object} options.pngOptions — те же настройки сжатия, что у иконок
 * @param {string} options.outFile
 */
export async function renderLinkPreview({
  sharp,
  sourcePath,
  wordmarkPath,
  colors,
  fontFamily,
  pngOptions,
  outFile,
}) {
  const title = escapeXml(readSchoolName(readFileSync(wordmarkPath, 'utf8')));
  const seal = await sharp(sourcePath).resize(SEAL_SIZE, SEAL_SIZE).png().toBuffer();
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}">
  <rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${colors.paper}"/>
  <text x="${PREVIEW_WIDTH / 2}" y="${TITLE_BASELINE}" text-anchor="middle" font-family="${fontFamily}" font-weight="${TITLE_WEIGHT}" font-size="${TITLE_SIZE}" letter-spacing="${TITLE_TRACKING}" fill="${colors.ink}">${title}</text>
  <text x="${PREVIEW_WIDTH / 2}" y="${SUBTITLE_BASELINE}" text-anchor="middle" font-family="${fontFamily}" font-weight="${TITLE_WEIGHT}" font-size="${SUBTITLE_SIZE}" fill="${colors.inkSoft}">${escapeXml(SUBTITLE)}</text>
</svg>`;

  await sharp(Buffer.from(canvas))
    .composite([
      { input: seal, left: Math.round((PREVIEW_WIDTH - SEAL_SIZE) / 2), top: SEAL_TOP },
    ])
    .png(pngOptions)
    .toFile(outFile);
}
