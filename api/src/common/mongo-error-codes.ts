// MongoDB не экспортирует коды ошибок как констант — только числа в
// документации драйвера. 11000 — E11000 duplicate key, единственный код,
// который бизнес-логика (замок миграций, тесты уникальных индексов) обязана
// отличать от прочих ошибок записи, поэтому здесь один именованный литерал,
// а не enum (CLAUDE.md — enum не используем).
export const MONGO_DUPLICATE_KEY_CODE = 11000;

/** Ошибка E11000 драйвера или Mongoose — единственная, которую бизнес-логика
 * (замок миграций, гонка первого входа) должна отличать от прочих сбоев записи. */
export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE
  );
}

/** `insertMany(docs, { ordered: false })` при гонке двух тиков планировщика
 * занятий: Mongoose декорирует ошибку полем `writeErrors` (по одному на
 * упавший документ), а при единственной ошибке иногда отдаёт только
 * верхнеуровневый `code`, без массива. И то, и другое — «это дубли, часть
 * документов всё равно вставилась» ТОЛЬКО если КАЖДАЯ ошибка — E11000; любая
 * другая ошибка в пачке должна уйти наверх, а не потеряться молча. */
export function isDuplicateKeyBulkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const writeErrors = (err as { writeErrors?: unknown }).writeErrors;
  if (Array.isArray(writeErrors) && writeErrors.length > 0) {
    return writeErrors.every((writeError) => isDuplicateKeyError(writeError));
  }
  return isDuplicateKeyError(err);
}
