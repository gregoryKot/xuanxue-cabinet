// Тексты массового удаления (ADR-0141) — чистые форматтеры, отдельно от
// components/BulkDeleteBar.tsx: юнит-тест без DOM (CLAUDE.md «Тесты»). Форму
// существительного (вопрос/экзамен/…) приносит вызывающий — один компонент
// работает с любой коллекцией, без ветвления по домену внутри.
//
// Безличная форма итога («Удалили», «Не удалось удалить») — нарочно: у
// склонения причастия по числу («удалён»/«удалены»/«удалена») пришлось бы
// разбирать род существительного вместе с числом (1/2/5, «вопрос»
// мужского рода, случайное будущее слово — например, «запись» — женского),
// а безличная форма верна при любом роде и числе (docs/VOICE.md, «Форма
// „вы“ и согласование» — тот же приём против брака согласования).
import { pluralRu, type BulkDeleteResult, type PluralForms } from '@xuanxue/shared';

/** Заголовок диалога подтверждения — «Удалить 3 вопроса?». */
export function formatBulkDeleteTitle(count: number, forms: PluralForms): string {
  return `Удалить ${count} ${pluralRu(count, forms)}?`;
}

/** Подпись бейджа выбора над списком — «Выбрано: 5». */
export function formatSelectedCount(n: number): string {
  return `Выбрано: **${n}**`;
}

/** Итог запроса: все удалились / часть отказала / никто не удалился —
 * три разные новости человеку (CLAUDE.md «Продуктовая фича = число в своём
 * разделе»: конкретное число, не «готово»). */
export function formatBulkDeleteSummary(
  result: BulkDeleteResult,
  forms: PluralForms,
): string {
  const deleted = result.deletedIds.length;
  const failed = result.failed.length;

  if (failed === 0) return `Удалили **${deleted} ${pluralRu(deleted, forms)}**`;
  // Число без существительного — оно уже названо в первой части фразы
  // («Удалили N вопросов»), второй раз повторять его незачем.
  if (deleted > 0)
    return `Удалили **${deleted} ${pluralRu(deleted, forms)}**. Не удалось удалить **${failed}**:`;
  return `Не удалось удалить **${failed} ${pluralRu(failed, forms)}**:`;
}

/** Уникальные сообщения отказа в порядке первого появления — тридцать
 * одинаковых «не найден» читаются одной строкой, не тридцатью. */
export function distinctFailureMessages(result: BulkDeleteResult): string[] {
  return [...new Set(result.failed.map((failure) => failure.message))];
}
