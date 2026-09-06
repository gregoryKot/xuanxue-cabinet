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
