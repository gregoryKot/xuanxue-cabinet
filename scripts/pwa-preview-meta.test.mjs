// Тест на сверку тегов превью ссылки (вызывается из scripts/check-pwa.mjs):
// фикстуры-строки, не реальные файлы репозитория — как в
// scripts/pwa-icon-sources.test.mjs, по той же причине: сверка должна ловить
// расхождение, а не запоминать сегодняшний web/index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readMetaContent,
  previewImageFile,
  findPreviewMetaProblems,
  PREVIEW_HINT,
} from './pwa-preview-meta.mjs';

// Тот же вид, что в web/index.html: часть тегов на одной строке, часть —
// перенесена prettier на несколько (og:description, og:image:alt).
const HTML_GOOD = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="Расписание занятий, ссылки на встречу и записи тренировок"
    />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Школа Сюань-Сюэ" />
    <meta property="og:locale" content="ru_RU" />
    <meta property="og:title" content="Школа Сюань-Сюэ" />
    <meta
      property="og:description"
      content="Расписание занятий, ссылки на встречу и записи тренировок"
    />
    <meta property="og:url" content="https://xuanxue.su/" />
    <meta property="og:image" content="https://xuanxue.su/og-cover.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta
      property="og:image:alt"
      content="Печать школы: черепаха, надпись XUANXUE и иероглифы 玄学"
    />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
</html>`;

const SCHOOL_NAME = 'Школа Сюань-Сюэ';

const good = (over = {}) => ({
  html: HTML_GOOD,
  publicFiles: ['og-cover.png', 'manifest.webmanifest'],
  distFiles: ['og-cover.png', 'index.html'],
  imageSize: { width: 1200, height: 630 },
  schoolName: SCHOOL_NAME,
  ...over,
});

test('readMetaContent разбирает многострочный тег и различает property/name', () => {
  const meta = readMetaContent(HTML_GOOD);
  assert.equal(
    meta['og:description'],
    'Расписание занятий, ссылки на встречу и записи тренировок',
  );
  assert.equal(meta['name:description'], meta['og:description']);
  assert.equal(meta['name:twitter:card'], 'summary_large_image');
});

test('previewImageFile берёт имя файла из абсолютного og:image', () => {
  assert.equal(previewImageFile(HTML_GOOD), 'og-cover.png');
});

test('previewImageFile — null, если og:image относительный или тега нет', () => {
  assert.equal(
    previewImageFile('<meta property="og:image" content="/og-cover.png" />'),
    null,
  );
  assert.equal(previewImageFile('<meta property="og:type" content="website" />'), null);
});

test('всё в порядке — расхождений нет', () => {
  assert.deepEqual(findPreviewMetaProblems(good()), []);
});

test('пропущенный тег — одна жалоба', () => {
  // og:locale, а не og:title/og:site_name: те дополнительно сверяются с
  // названием школы (см. тест ниже) и дали бы вторую жалобу — здесь же
  // важно проверить ровно «тега нет» в изоляции.
  const html = HTML_GOOD.replace('<meta property="og:locale" content="ru_RU" />', '');
  assert.deepEqual(findPreviewMetaProblems(good({ html })), [
    'в web/index.html нет <meta property="og:locale"> или он пустой',
  ]);
});

test('og:image относительный — часть краулеров его не развернёт', () => {
  const html = HTML_GOOD.replace(
    'content="https://xuanxue.su/og-cover.png"',
    'content="/og-cover.png"',
  );
  assert.deepEqual(findPreviewMetaProblems(good({ html })), [
    'og:image должен быть абсолютным https-адресом, сейчас: /og-cover.png',
  ]);
});

test('og:url и og:image указывают на разные хосты', () => {
  const html = HTML_GOOD.replace(
    'content="https://xuanxue.su/og-cover.png"',
    'content="https://cdn.example.com/og-cover.png"',
  );
  // Сверяется смысл, а не буква: текст жалобы переписывают, и тест на точное
  // совпадение строки краснел бы на правке формулировки.
  const problems = findPreviewMetaProblems(good({ html }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /разные хосты/);
  assert.match(problems[0], /cdn\.example\.com/);
});

test('картинки превью нет в собранном web/dist', () => {
  const distFiles = ['index.html'];
  assert.deepEqual(findPreviewMetaProblems(good({ distFiles })), [
    'og-cover.png не попал в сборку web/dist — собери web заново',
  ]);
});

test('размер настоящего PNG разошёлся с og:image:width/height', () => {
  const imageSize = { width: 600, height: 315 };
  assert.deepEqual(findPreviewMetaProblems(good({ imageSize })), [
    'размер og-превью (600x315) не совпадает с og:image:width/height (1200x630) — ' +
      `перерисовал картинку другого размера? Собери теги заново: ${PREVIEW_HINT}`,
  ]);
});

test('twitter:card не summary_large_image — крупная картинка не покажется', () => {
  const html = HTML_GOOD.replace('content="summary_large_image"', 'content="summary"');
  assert.deepEqual(findPreviewMetaProblems(good({ html })), [
    '<meta name="twitter:card"> должен быть "summary_large_image", сейчас: summary ' +
      '(иначе iMessage и X показывают мелкую плашку вместо крупной картинки)',
  ]);
});

test('og:title разошёлся с константой SCHOOL_NAME кабинета', () => {
  const html = HTML_GOOD.replace(
    'property="og:title" content="Школа Сюань-Сюэ"',
    'property="og:title" content="Старое название"',
  );
  const problems = findPreviewMetaProblems(good({ html }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /og:title/);
  assert.match(problems[0], /Старое название/);
  assert.match(problems[0], /SchoolWordmark\.tsx/);
});

test('название школы не прочиталось — своя жалоба, сверки нет', () => {
  const problems = findPreviewMetaProblems(good({ schoolName: null }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /не удалось прочитать название школы/);
  assert.match(problems[0], /SchoolWordmark\.tsx/);
});
