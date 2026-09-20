// Юнит-тест форматирования пути/отчёта/ошибки CLI — чистая логика, без
// Nest и без Mongo (CLAUDE.md «Тесты»).
import { join } from 'path';
import { formatSeedFailure, formatSeedReport, resolveSeedPath } from './seed-report';
import { SeedValidationFailedError } from './seed.service';

const REPO_ROOT = '/repo';
const DEFAULT_RELATIVE_PATH = 'api/seed/classes.local.json';

describe('resolveSeedPath', () => {
  it('без аргумента — путь по умолчанию от корня репозитория', () => {
    expect(resolveSeedPath(undefined, REPO_ROOT, DEFAULT_RELATIVE_PATH)).toBe(
      join(REPO_ROOT, 'api/seed/classes.local.json'),
    );
  });

  it('относительный путь — от корня репозитория, не от cwd', () => {
    expect(
      resolveSeedPath('api/seed/classes.example.json', REPO_ROOT, DEFAULT_RELATIVE_PATH),
    ).toBe(join(REPO_ROOT, 'api/seed/classes.example.json'));
  });

  it('абсолютный путь — как есть', () => {
    expect(resolveSeedPath('/tmp/x.json', REPO_ROOT, DEFAULT_RELATIVE_PATH)).toBe(
      '/tmp/x.json',
    );
  });
});

describe('formatSeedReport', () => {
  it('пропущено 0 — без «(уже есть)»', () => {
    expect(formatSeedReport({ created: ['А', 'Б'], skipped: [] })).toBe(
      'Создано 2, пропущено 0.',
    );
  });

  it('пропущено больше 0 — с «(уже есть)» и названиями', () => {
    expect(formatSeedReport({ created: [], skipped: ['А', 'Б'] })).toBe(
      'Создано 0, пропущено 2 (уже есть): А, Б.',
    );
  });
});

describe('formatSeedFailure', () => {
  const EXAMPLE_PATH = 'api/seed/classes.example.json';

  it('ENOENT — «Файла нет: <путь>. Создайте его по образцу …»', () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

    expect(
      formatSeedFailure(err, '/repo/api/seed/classes.local.json', EXAMPLE_PATH),
    ).toEqual([
      'Файла нет: /repo/api/seed/classes.local.json. Создайте его по образцу ' +
        'api/seed/classes.example.json.',
    ]);
  });

  it('SeedValidationFailedError — список ошибок и строка про формат', () => {
    const err = new SeedValidationFailedError([
      { path: 'classes[0].title', message: 'обязательно' },
    ]);

    const lines = formatSeedFailure(
      err,
      '/repo/api/seed/classes.local.json',
      EXAMPLE_PATH,
    );

    expect(lines[0]).toContain('не прошёл валидацию (1)');
    expect(lines).toContainEqual('  classes[0].title: обязательно');
    expect(lines.at(-1)).toBe('Формат — api/seed/classes.example.json.');
  });

  it('прочая ошибка — её собственное сообщение', () => {
    expect(
      formatSeedFailure(new Error('что-то сломалось'), '/x.json', EXAMPLE_PATH),
    ).toEqual(['что-то сломалось']);
  });
});
