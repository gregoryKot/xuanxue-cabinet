// Автосохранение ответов (ТЗ 4.4, п.4–5) — чистые функции без похода в базу,
// юнит-тест без Mongo (CLAUDE.md «Тесты»).
import { ATTEMPT_UNKNOWN_ITEM_MESSAGE, type AttemptAnswerDto } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { AttemptBlockRecord } from './exam-attempt.schema';

/** Ответ только на вопрос из снимка (ТЗ 4.4, п.5): `itemId`, которого в
 * снимке нет, — 400, а не молчаливое сохранение мусора. */
export function assertAnswersKnown(
  blocks: readonly AttemptBlockRecord[],
  answers: readonly AttemptAnswerDto[],
): void {
  const known = new Set(
    blocks.flatMap((block) => block.questions.map((question) => question.itemId)),
  );
  const hasUnknown = answers.some((answer) => !known.has(answer.itemId));
  if (hasUnknown) throw new InvalidInputError(ATTEMPT_UNKNOWN_ITEM_MESSAGE);
}

/** Частичное сохранение: присланные ответы заменяют ответы по тем же
 * `itemId`, остальные не трогаются (ТЗ 4.4, п.4 — ученик отвечает по одному
 * вопросу). Порядок существующих ответов сохраняется, новые добавляются в конец. */
export function mergeAnswers(
  current: readonly AttemptAnswerDto[],
  incoming: readonly AttemptAnswerDto[],
): AttemptAnswerDto[] {
  const byItemId = new Map(current.map((answer) => [answer.itemId, answer]));
  for (const answer of incoming) byItemId.set(answer.itemId, answer);
  return [...byItemId.values()];
}
