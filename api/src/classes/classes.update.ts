// Чистые функции подготовки PATCH-запроса — без похода в базу, юнит-тест без
// Mongo (CLAUDE.md, раздел «Тесты»).
import { Types } from 'mongoose';
import type { ScheduleRule, ScheduleRuleInput } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

export interface SplitUpdate {
  $set: Record<string, unknown>;
  $unset: Record<string, ''>;
}

/**
 * `null` в PATCH — явный сброс поля (`$unset`), но только у полей из
 * `nullableFields` (`NULLABLE_CLASS_FIELDS`, shared) — остальные `null`
 * ловит `@IsOptional()`/`OptionalNotNull()` ещё в DTO (400 от
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

/** Идентификатор правила для `@ArrayUnique()` в ClassFieldsDto (сравнение
 * должно быть по `id` существующего правила, а не по ссылке на объект).
 * Правило без `id` — новое, оно не может дублировать другое: разовый Symbol
 * гарантирует, что два новых правила в одном запросе друг другу не мешают. */
export function ruleUniqueKey(rule: ScheduleRuleInput): string | symbol {
  return rule.id ?? Symbol('new-rule');
}

export interface RuleSubdoc extends ScheduleRule {
  _id: Types.ObjectId;
}

/** Правило с `id` — существующий субдокумент, `_id` сохраняется (планировщик
 * ссылается на конкретное правило, не сравнивая поля — см. `ruleId` в
 * lesson.schema.ts и комментарий у `ScheduleRuleSubdoc` в class.schema.ts);
 * без `id` — новое правило, `_id` создаёт Mongoose. `undefined` на входе
 * (правила в PATCH не прислали) — не трогаем массив правил вовсе, поэтому и
 * на выходе `undefined`. */
export function mapRules(
  rules: ScheduleRuleInput[] | undefined,
): RuleSubdoc[] | undefined {
  if (rules === undefined) return undefined;
  return rules.map(({ id, ...rule }) => ({
    ...rule,
    _id: id === undefined ? new Types.ObjectId() : new Types.ObjectId(id),
  }));
}
