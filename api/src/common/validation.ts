// Общие хелперы-декораторы class-validator для DTO занятий и не только
// (CLAUDE.md, раздел «API»: `null` в PATCH допустим только у полей, что это
// прямо разрешают).
import { applyDecorators } from '@nestjs/common';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';

const LIST_LIMIT_MIN = 1;

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

/** Query-параметр `limit` списковых DTO — один декоратор на все домены
 * (CLAUDE.md «одна механика — один компонент»): необязателен (сервис
 * подставляет дефолт), но если задан — целое число в границах `1..max`
 * («дай всё» запрещён, CLAUDE.md «API»). `max` — свой потолок списка
 * (`LIST_LIMIT_MAX` по умолчанию; `/me/lessons` короче — своя пара
 * MY_LESSONS_LIMIT_*, shared/src/lessons.ts). */
export function ListLimit(max: number = LIST_LIMIT_MAX): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(LIST_LIMIT_MIN),
    Max(max),
  );
}
