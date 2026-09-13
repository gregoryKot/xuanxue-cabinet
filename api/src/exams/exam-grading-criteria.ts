// Чистая функция сборки снимка критериев оценки (ТЗ 4.6, п.2) — без похода в
// базу, юнит-тест без Mongo (CLAUDE.md «Тесты»). Снимок берёт `title`/
// `maxScore` из ТЕКУЩЕЙ рубрики экзамена по `id` критерия, не из запроса —
// иначе учитель мог бы задним числом переписать шкалу прямо в оценке.
import {
  invalidScoreMessage,
  unknownCriterionMessage,
  type GradingCriterionInput,
  type RubricCriterionDto,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { GradingCriterionRecord } from './exam-grading.schema';

const MIN_SCORE = 0;

/** Критерий из запроса, которого нет в рубрике, — 400 (ТЗ 4.6, п.2: рубрику
 * могли переписать, пока учитель заполнял баллы); баллы вне `0..maxScore`
 * своего критерия — тоже 400. */
export function buildGradingCriteria(
  rubric: readonly RubricCriterionDto[],
  input: readonly GradingCriterionInput[],
): GradingCriterionRecord[] {
  const byId = new Map(rubric.map((criterion) => [criterion.id, criterion]));
  return input.map((entry) => {
    const criterion = byId.get(entry.id);
    if (!criterion) throw new InvalidInputError(unknownCriterionMessage(entry.id));
    if (entry.score < MIN_SCORE || entry.score > criterion.maxScore) {
      throw new InvalidInputError(
        invalidScoreMessage(criterion.title, criterion.maxScore),
      );
    }
    return {
      id: criterion.id,
      title: criterion.title,
      maxScore: criterion.maxScore,
      score: entry.score,
      comment: entry.comment,
    };
  });
}
