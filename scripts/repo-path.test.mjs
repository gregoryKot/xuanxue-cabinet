// Метка файла в гейтах не зависит от ОС: на Windows `path.relative` отдаёт `\`,
// а бейслайны закоммичены с `/` (инцидент 2026-10-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { repoPath } from './repo-path.mjs';

const ROOT = join(import.meta.dirname, '..');

test('repoPath: вложенный файл → путь с прямыми слэшами', () => {
  assert.equal(repoPath(ROOT, join(ROOT, 'web', 'src', 'x.ts')), 'web/src/x.ts');
});

test('repoPath: файл в корне → просто имя', () => {
  assert.equal(repoPath(ROOT, join(ROOT, 'package.json')), 'package.json');
});

test('repoPath: корень — подкаталог, как в coverage-ratchet для api', () => {
  assert.equal(
    repoPath(join(ROOT, 'api'), join(ROOT, 'api', 'src', 'utils', 'a.ts')),
    'src/utils/a.ts',
  );
});
