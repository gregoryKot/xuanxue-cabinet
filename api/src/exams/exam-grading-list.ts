// Оценки по списку попыток — вынесено из ExamGradingsService (файл-лимит
// CLAUDE.md «Храповики»: сервис уже стоит на границе 150 строк), тем же
// приёмом, что media-asset-list.ts: только запрос и группировка, без
// расшифровки — `outcome` не шифруется (plain, exam-grading.schema.ts), а
// `gradedAt` хранится `Date`, не строкой (encJson), decryptRecord здесь не
// нужен вовсе.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { GradingOutcome } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { ExamGradingRecord } from './exam-grading.schema';

export interface AttemptGradingSummary {
  outcome: GradingOutcome;
  gradedAt: string; // ISO UTC с Z
}

interface RawGradingSummary {
  attemptId: Types.ObjectId;
  outcome: GradingOutcome;
  gradedAt: Date;
}

/** Один запрос на список попыток (учитель, `GET /attempts`,
 * ExamAttemptsService.list) — не по документу, тот же приём, что
 * `userNamesService.namesByIds` рядом. */
export async function listGradingsForAttempts(
  model: Model<ExamGradingRecord>,
  attemptIds: string[],
): Promise<Map<string, AttemptGradingSummary>> {
  const ids = attemptIds.filter((id) => Types.ObjectId.isValid(id));
  const byAttempt = new Map<string, AttemptGradingSummary>();
  if (ids.length === 0) return byAttempt;

  const docs = await model
    .find({ attemptId: { $in: ids } }, { attemptId: 1, outcome: 1, gradedAt: 1 })
    .lean<RawGradingSummary[]>();
  for (const doc of docs) {
    byAttempt.set(doc.attemptId.toString(), {
      outcome: doc.outcome,
      gradedAt: toIsoUtc(doc.gradedAt),
    });
  }
  return byAttempt;
}
