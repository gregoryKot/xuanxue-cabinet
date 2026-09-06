// Чистая функция подготовки PATCH-запроса — без похода в базу, юнит-тест без
// Mongo (CLAUDE.md, раздел «Тесты»). Общая для всех доменов с nullable-полями
// (classes, lessons) — правило CLAUDE.md «одна механика — один компонент».
import { InvalidInputError } from './errors';

export interface SplitUpdate {
  $set: Record<string, unknown>;
  $unset: Record<string, ''>;
}

/**
 * `null` в PATCH — явный сброс поля (`$unset`), но только у полей из
 * `nullableFields` (`NULLABLE_CLASS_FIELDS`/`NULLABLE_LESSON_FIELDS`, shared) —
 * остальные `null` ловит `@IsOptional()`/`OptionalNotNull()` ещё в DTO (400 от
 * `ValidationPipe`). Проверка здесь — защита в глубину на случай, если
 * сервис вызовут напрямую или DTO разойдётся со списком: `null` вне списка
 * не должен молча превратиться в `$unset` неположенного поля.
 * Отсутствующее поле (`undefined`) не трогаем вовсе, чтобы не затирать то,
 * что не прислали.
 */
export function splitUpdate(
  input: Record<string, unknown>,
  nullableFields: readonly string[],
): SplitUpdate {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) {
      if (!nullableFields.includes(key)) {
        throw new InvalidInputError(
          `Поле «${key}» нельзя очистить. Укажите значение или уберите поле из запроса.`,
        );
      }
      $unset[key] = '';
    } else {
      $set[key] = value;
    }
  }
  return { $set, $unset };
}
