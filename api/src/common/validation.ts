// Общие хелперы-декораторы class-validator для DTO занятий и не только
// (CLAUDE.md, раздел «API»: `null` в PATCH допустим только у полей, что это
// прямо разрешают).
import { Transform, type TransformFnParams } from 'class-transformer';
import { ValidateIf } from 'class-validator';

/**
 * Замена `@IsOptional()` для полей, где `null` — не «поле не прислали», а
 * ошибка формы. Стандартный `@IsOptional()` пропускает валидацию и на
 * `undefined`, и на `null`; здесь пропускается только `undefined` —
 * `null` доходит до `@IsString()`/`@IsInt()` и т.п. ниже и получает 400.
 * Nullable-поля PATCH (location/zoomLink/zoomPassword/leaderId,
 * `UpdateClassInput` в shared) держат обычный `@IsOptional()`.
 */
export function OptionalNotNull(): PropertyDecorator {
  return ValidateIf((_object: object, value: unknown) => value !== undefined);
}

/** Обрезает пробелы по краям строки до остальных декораторов (`@IsNotEmpty()`
 * и так далее) — иначе `'   '` проходит как непустая строка. Не строку —
 * не трогает, дальше решает `@IsString()`. */
export function TrimString(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  );
}
