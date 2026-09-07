// Форматирование пути к файлу, итога импорта и ошибок CLI — чистая логика,
// юнит-тест без Nest/Mongo. seed-classes.ts остаётся только bootstrap
// (CLAUDE.md «Логика вне контроллеров и компонентов» — тот же принцип для CLI).
import { isAbsolute, join } from 'path';
import { SEED_EXAMPLE_PATH } from './seed-file';
import { SeedValidationFailedError, type SeedReport } from './seed.service';

const DEFAULT_RELATIVE_PATH = 'api/seed/classes.local.json';

/**
 * Относительный путь — от корня репозитория (`repoRoot`), не от `process.cwd()`:
 * `npm run --workspace=api` стартует с cwd внутри `api/`, и относительный
 * путь резолвился бы не туда (RUNBOOK §2.2). Абсолютный путь — как есть.
 */
export function resolveSeedPath(arg: string | undefined, repoRoot: string): string {
  const relative = arg ?? DEFAULT_RELATIVE_PATH;
  return isAbsolute(relative) ? relative : join(repoRoot, relative);
}

/** «Создано N, пропущено M (уже есть): …» — суффикс «(уже есть): …»
 * только когда правда есть что перечислить (M > 0), иначе повисшая
 * пустая скобка после первого же импорта на чистой базе. */
export function formatSeedReport(report: SeedReport): string {
  const skippedPart =
    report.skipped.length > 0
      ? `пропущено ${report.skipped.length} (уже есть): ${report.skipped.join(', ')}`
      : `пропущено ${report.skipped.length}`;
  return `Создано ${report.created.length}, ${skippedPart}.`;
}

function isEnoentError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Строки для печати при неудачном импорте — seed-classes.ts просто
 * логирует их одну за другой, без своей форматирующей логики. */
export function formatSeedFailure(err: unknown, filePath: string): string[] {
  if (isEnoentError(err)) {
    return [`Файла нет: ${filePath}. Создайте его по образцу ${SEED_EXAMPLE_PATH}.`];
  }
  if (err instanceof SeedValidationFailedError) {
    return [
      `Файл сида не прошёл валидацию (${err.errors.length}):`,
      ...err.errors.map((e) => `  ${e.path}: ${e.message}`),
      `Формат — ${SEED_EXAMPLE_PATH}.`,
    ];
  }
  return [err instanceof Error ? err.message : String(err)];
}
