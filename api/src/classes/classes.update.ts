// Чистые функции подготовки правил расписания в PATCH-запросе — без похода в
// базу, юнит-тест без Mongo (CLAUDE.md, раздел «Тесты»). `splitUpdate` уехал
// в `api/src/common/patch-update.ts` — теперь у неё два потребителя
// (classes, lessons), общая механика не должна жить в домене одного из них.
import { Types } from 'mongoose';
import {
  EVERY_TWO_WEEKS,
  ruleRecurrenceError,
  type ScheduleRule,
  type ScheduleRuleInput,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

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

/** Что хранить из «как часто» (ADR-0168). Раз в две недели — оба поля, после
 * проверки пары (дата обязана быть и выпадать на день правила). Еженедельное
 * правило не хранит ни `everyWeeks: 1`, ни дату: лишняя дата при переключении
 * «раз в две недели → каждую неделю» осталась бы в базе мёртвым грузом, а
 * `1` и «поля нет» значили бы одно и то же двумя способами. */
function recurrenceOf(
  rule: ScheduleRuleInput,
  index: number,
): Pick<ScheduleRule, 'everyWeeks' | 'startsOn'> {
  if (rule.everyWeeks !== EVERY_TWO_WEEKS) return {};
  const problem = ruleRecurrenceError(rule);
  if (problem !== null) throw new InvalidInputError(`Правило ${index + 1}: ${problem}`);
  return { everyWeeks: rule.everyWeeks, startsOn: rule.startsOn };
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
  return rules.map((rule, index) => ({
    weekday: rule.weekday,
    time: rule.time,
    durationMin: rule.durationMin,
    ...recurrenceOf(rule, index),
    _id: rule.id === undefined ? new Types.ObjectId() : new Types.ObjectId(rule.id),
  }));
}
