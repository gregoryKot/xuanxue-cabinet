// Сверка тегов превью ссылки (Open Graph, twitter:card) в web/index.html —
// без них мессенджер показывает серую плашку с одним словом «xuanxue.su»
// вместо адреса, картинки и подписи (снимок владельца из iMessage,
// 2026-09-22, комментарий в web/index.html над блоком тегов). Теги
// статические и одни на все маршруты — index.html отдаётся SPA-фолбэком
// (api/src/static/), поэтому проверка идёт по исходнику, не по каждому
// экрану.
//
// findPreviewMetaProblems — чистая функция: принимает уже прочитанный html и
// списки файлов, а не пути, поэтому тестируется фикстурами-строками
// (scripts/pwa-preview-meta.test.mjs) без реальных файлов репозитория.
// collectPreviewMetaProblems внизу — тонкая обвязка поверх файловой системы
// для scripts/check-pwa.mjs, без своих тестов: файловый ввод-вывод проверяет
// сам прогон гейта.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { readSchoolName } from './brand-preview.mjs';

export const REQUIRED_PREVIEW_PROPERTIES = [
  'og:type',
  'og:site_name',
  'og:locale',
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
];

export const PREVIEW_HINT = 'node scripts/generate-pwa-icons.mjs';

const META_TAG = /<meta\b([\s\S]*?)\/?>/gi;
const attrValue = (attrs, name) =>
  new RegExp(`${name}=["']([^"']*)["']`).exec(attrs)?.[1] ?? null;

/**
 * Разбирает все <meta> тега html, включая перенесённые prettier на
 * несколько строк. Ключ — сам property (`og:title`) либо name с префиксом
 * (`name:description`): у property и name разные пространства имён, иначе
 * `og:title` и гипотетический `name:title` слились бы в один ключ.
 */
export function readMetaContent(html) {
  const result = {};
  for (const match of html.matchAll(META_TAG)) {
    const attrs = match[1];
    const content = attrValue(attrs, 'content');
    if (content === null) continue;
    const property = attrValue(attrs, 'property');
    const name = attrValue(attrs, 'name');
    const key = property ?? (name ? `name:${name}` : null);
    if (key) result[key] = content;
  }
  return result;
}

/** Абсолютный https-адрес, разобранный URL — иначе null (в т.ч. на мусор). */
function parseAbsoluteHttpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Имя файла og:image внутри web/public — null, если тега нет или адрес не
 * абсолютный https:// (относительный часть краулеров не разворачивает). */
export function previewImageFile(html) {
  const url = parseAbsoluteHttpsUrl(readMetaContent(html)['og:image']);
  if (!url) return null;
  return url.pathname.split('/').pop() || null;
}

/**
 * Возвращает список расхождений — по строке на каждое. Пустой список значит,
 * что превью соберётся правильным адресом, текстом, размером и картинкой.
 */
export function findPreviewMetaProblems({
  html,
  publicFiles,
  distFiles,
  imageSize,
  schoolName,
}) {
  const meta = readMetaContent(html);
  const problems = [];

  for (const property of REQUIRED_PREVIEW_PROPERTIES) {
    if (!meta[property])
      problems.push(`в web/index.html нет <meta property="${property}"> или он пустой`);
  }
  if (!meta['name:description'])
    problems.push('в web/index.html нет <meta name="description"> или он пустой');

  const twitterCard = meta['name:twitter:card'];
  if (twitterCard !== 'summary_large_image')
    problems.push(
      '<meta name="twitter:card"> должен быть "summary_large_image", сейчас: ' +
        `${twitterCard ?? 'тега нет'} (иначе iMessage и X показывают мелкую плашку ` +
        'вместо крупной картинки)',
    );

  const ogUrl = parseAbsoluteHttpsUrl(meta['og:url']);
  const ogImage = parseAbsoluteHttpsUrl(meta['og:image']);
  if (meta['og:url'] && !ogUrl)
    problems.push(
      `og:url должен быть абсолютным https-адресом, сейчас: ${meta['og:url']}`,
    );
  if (meta['og:image'] && !ogImage)
    problems.push(
      `og:image должен быть абсолютным https-адресом, сейчас: ${meta['og:image']}`,
    );
  if (ogUrl && ogImage && ogUrl.host !== ogImage.host)
    problems.push(
      `og:url (${ogUrl.host}) и og:image (${ogImage.host}) ведут на разные хосты — ` +
        'картинку превью раздаёт сам кабинет, чужой адрес тут означает опечатку',
    );

  const file = previewImageFile(html);
  if (file) {
    if (!publicFiles.includes(file))
      problems.push(
        `картинка ${file} не лежит в web/public — нарисуй её: ${PREVIEW_HINT}`,
      );
    if (!distFiles.includes(file))
      problems.push(`${file} не попал в сборку web/dist — собери web заново`);
  }

  const widthText = meta['og:image:width'];
  const heightText = meta['og:image:height'];
  if (!imageSize) {
    problems.push(
      `не удалось прочитать размер og-превью — собери картинку: ${PREVIEW_HINT}`,
    );
  } else if (widthText && heightText) {
    if (imageSize.width !== Number(widthText) || imageSize.height !== Number(heightText))
      problems.push(
        `размер og-превью (${imageSize.width}x${imageSize.height}) не совпадает с ` +
          `og:image:width/height (${widthText}x${heightText}) — перерисовал картинку ` +
          `другого размера? Собери теги заново: ${PREVIEW_HINT}`,
      );
  }

  // Название школы объявлено один раз — в SchoolWordmark.tsx (CLAUDE.md,
  // «Повторяющийся текст пользователю — тоже константа»). Теги статические и
  // при переименовании школы не поменяются сами — расхождение иначе всплывёт
  // только у человека, получившего ссылку.
  if (schoolName === null) {
    problems.push(
      'не удалось прочитать название школы из ' +
        'web/src/components/SchoolWordmark.tsx (константа SCHOOL_NAME) — ' +
        'og:title и og:site_name не с чем свериться',
    );
  } else {
    if (meta['og:title'] !== schoolName)
      problems.push(
        `og:title ("${meta['og:title'] ?? 'пусто'}") разошёлся с названием школы ` +
          `("${schoolName}") из web/src/components/SchoolWordmark.tsx`,
      );
    if (meta['og:site_name'] !== schoolName)
      problems.push(
        `og:site_name ("${meta['og:site_name'] ?? 'пусто'}") разошёлся с названием школы ` +
          `("${schoolName}") из web/src/components/SchoolWordmark.tsx`,
      );
  }

  return problems;
}

/** Имена файлов прямо в каталоге (не поддиректории). */
function filesIn(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Ширина/высота PNG из заголовка чанка IHDR — без sharp, гейту лишняя
 * зависимость не нужна. null — файла нет или это не PNG. */
function readPngSize(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Собирает списки файлов web/public и web/dist, размер настоящей картинки
 * превью и зовёт findPreviewMetaProblems. `html` уже прочитан вызывающим
 * (check-pwa.mjs читает web/index.html и для findShellColorProblems тоже).
 */
export function collectPreviewMetaProblems({ root, dist, html }) {
  const publicDir = join(root, 'web', 'public');
  const publicFiles = filesIn(publicDir);
  const distFiles = filesIn(dist);
  const file = previewImageFile(html);
  const imageSize = file ? readPngSize(join(publicDir, file)) : null;

  let schoolName = null;
  try {
    const wordmarkPath = join(root, 'web', 'src', 'components', 'SchoolWordmark.tsx');
    schoolName = readSchoolName(readFileSync(wordmarkPath, 'utf8'));
  } catch {
    // остаётся null — findPreviewMetaProblems сам пожалуется; файл может не
    // читаться или константа — не находиться (readSchoolName кидает в этом
    // случае), гейт обязан пожаловаться строкой, а не упасть стеком.
  }

  return findPreviewMetaProblems({ html, publicFiles, distFiles, imageSize, schoolName });
}
