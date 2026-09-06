// Чистые функции подготовки правил расписания в PATCH-запросе — без похода в
// базу, юнит-тест без Mongo (CLAUDE.md, раздел «Тесты»). `splitUpdate` уехал
// в `api/src/common/patch-update.ts` — теперь у неё два потребителя
// (classes, lessons), общая механика не должна жить в домене одного из них.
import { Types } from 'mongoose';
import type { ScheduleRule, ScheduleRuleInput } from '@xuanxue/shared';

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
