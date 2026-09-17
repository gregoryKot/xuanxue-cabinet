// Тест на разбор check-name-collisions.mjs (CLAUDE.md, храповик
// «check-name-collisions.mjs»): фикстуры-списки путей, не реальное дерево
// репозитория — иначе тест ловит только сегодняшнее состояние, а не разбор.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNameCollisions } from './check-name-collisions.mjs';

test('модули: компонент и хелпер, различающиеся регистром первой буквы', () => {
  const collisions = findNameCollisions([
    'web/src/exams/ExamQuestionList.tsx',
    'web/src/exams/examQuestionList.ts',
  ]);
  assert.deepEqual(collisions, [
    {
      kind: 'module',
      files: ['web/src/exams/ExamQuestionList.tsx', 'web/src/exams/examQuestionList.ts'],
    },
  ]);
});

test('модули: сегодняшние имена (ExamQuestionList.tsx и examQuestions.ts) — не коллизия', () => {
  assert.deepEqual(
    findNameCollisions([
      'web/src/exams/ExamQuestionList.tsx',
      'web/src/exams/examQuestions.ts',
      'web/src/exams/examQuestions.test.ts',
    ]),
    [],
  );
});

test('модули: один каталог, но разное написание в разных каталогах — не коллизия', () => {
  assert.deepEqual(
    findNameCollisions(['web/src/exams/ExamCard.tsx', 'web/src/lib/examCard.ts']),
    [],
  );
});

test('модули: одинаковое написание с разными расширениями — не коллизия', () => {
  assert.deepEqual(findNameCollisions(['scripts/tool.ts', 'scripts/tool.js']), []);
});

test('файлы: полное совпадение имени без учёта регистра', () => {
  const collisions = findNameCollisions(['docs/Readme.md', 'docs/README.md']);
  assert.deepEqual(collisions, [
    { kind: 'file', files: ['docs/Readme.md', 'docs/README.md'] },
  ]);
});

test('файлы: коллизия имён кода не дублируется как коллизия модулей', () => {
  const collisions = findNameCollisions(['web/src/Foo.ts', 'web/src/foo.ts']);
  assert.deepEqual(collisions, [
    { kind: 'file', files: ['web/src/Foo.ts', 'web/src/foo.ts'] },
  ]);
});

test('не-код: картинки с именами в разном регистре импортируются с расширением', () => {
  assert.deepEqual(
    findNameCollisions(['web/public/logo.svg', 'web/public/Logo.png']),
    [],
  );
});

test('суффикс .test не считается расширением модуля', () => {
  assert.deepEqual(
    findNameCollisions([
      'web/src/exams/examCounts.ts',
      'web/src/exams/examCounts.test.ts',
    ]),
    [],
  );
});

test('чистый репозиторий без коллизий — пустой список', () => {
  assert.deepEqual(
    findNameCollisions(['api/src/main.ts', 'web/src/main.tsx', 'README.md']),
    [],
  );
});
