// Тело PUT /attempts/:id/grading (слой 4.6, ТЗ 4.6, п.2) — итог и общий
// комментарий учителя. Баллы по критериям рубрики удалены с концами
// (решение владельца 2026-09-17, ADR-0038): критерии по
// умолчанию нельзя было переписать под себя в интерфейсе (CLAUDE.md
// «Кабинет учителя: всё настраивается в интерфейсе»). Идемпотентность —
// в ExamGradingsService (уникальный индекс attemptId).
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  GRADING_LIMITS,
  GRADING_OUTCOMES,
  type GradingOutcome,
  type PutGradingInput,
} from '@xuanxue/shared';

export class PutGradingDto implements PutGradingInput {
  @IsOptional()
  @IsString()
  @MaxLength(GRADING_LIMITS.comment)
  comment?: string;

  @IsIn(GRADING_OUTCOMES)
  outcome!: GradingOutcome;
}
