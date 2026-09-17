// Составной id кнопки итога проверки (ТЗ 4б.5, PLAN §12) — attemptId:outcome
// внутри «действие:параметр» (callback-data.ts), тот же приём, что у
// QuestionId/OptionId в exam-callback-ids.ts: разбор параметра уже
// распознанного действия, не второй парсер CallbackAction.
import { Types } from 'mongoose';
import { GRADING_OUTCOMES, type GradingOutcome } from '@xuanxue/shared';

export interface GradeButtonId {
  attemptId: string;
  outcome: GradingOutcome;
}

export function buildGradeButtonId(attemptId: string, outcome: GradingOutcome): string {
  return `${attemptId}:${outcome}`;
}

function isGradingOutcome(value: string): value is GradingOutcome {
  return (GRADING_OUTCOMES as readonly string[]).includes(value);
}

export function parseGradeButtonId(id: string): GradeButtonId | null {
  const [attemptId, outcomeRaw] = id.split(':');
  if (!attemptId || !Types.ObjectId.isValid(attemptId)) return null;
  if (!outcomeRaw || !isGradingOutcome(outcomeRaw)) return null;
  return { attemptId, outcome: outcomeRaw };
}
