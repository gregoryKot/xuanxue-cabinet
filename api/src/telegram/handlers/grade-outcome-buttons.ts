// Кнопки итога проверки (ТЗ 4б.5, PLAN §12) — «Зачёт»/«Доработать»/«Незачёт»
// под карточкой сданной работы, «Без комментария»/«Отмена» под ожиданием
// комментария. Чистая логика, без Mongo и без сети (CLAUDE.md «Тесты»).
import type { GradingOutcome } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import { buildGradeButtonId } from './grade-callback-id';

// Порядок — как в ТЗ: «Зачёт», «Доработать», «Незачёт», не порядок
// GRADING_OUTCOMES (тот заведён для другой цели — миграции и валидации).
const GRADE_OUTCOME_ORDER: readonly GradingOutcome[] = ['passed', 'needs_work', 'failed'];

export const GRADE_OUTCOME_LABELS: Record<GradingOutcome, string> = {
  passed: 'Зачёт',
  needs_work: 'Доработать',
  failed: 'Незачёт',
};

export function buildGradeOutcomeButtons(attemptId: string): InlineKeyboardButton[][] {
  return [
    GRADE_OUTCOME_ORDER.map((outcome) =>
      inlineButton(
        GRADE_OUTCOME_LABELS[outcome],
        'grade',
        buildGradeButtonId(attemptId, outcome),
      ),
    ),
  ];
}

export function buildSkipCancelButtons(attemptId: string): InlineKeyboardButton[][] {
  return [
    [
      inlineButton('Без комментария', 'gradesk', attemptId),
      inlineButton('Отмена', 'gradecl', attemptId),
    ],
  ];
}
