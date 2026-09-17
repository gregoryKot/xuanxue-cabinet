// Финал проверки — общий для кнопки «Без комментария» (grade-callback.handler.ts)
// и текстового комментария (grade-comment.handler.ts): один вызов
// ExamBotPort.gradeAttempt (тот же ExamGradingsService.grade(), что кабинет —
// идемпотентно по attemptId, сам шлёт ученику exam_result), один текст итога
// (CLAUDE.md «Одна механика — один компонент»).
//
// Сбой ExamBotPort.gradeAttempt (Mongo моргнула и т.п.) не закрывает
// ожидание — учитель может отправить комментарий ещё раз без повторного
// нажатия «Зачёт»/«Доработать»/«Незачёт» (CLAUDE.md, ТЗ: «упавший хендлер —
// фраза, ожидание до TTL»). `null` (попытка исчезла) и успех — оба закрывают
// ожидание: второй попытки тут нет смысла ждать.
import type { DateTime } from 'luxon';
import type { GradingOutcome } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { examUserFacingError } from './exam-attempt-error';
import { GRADE_ATTEMPT_NOT_FOUND_MESSAGE } from './grade-messages';
import { GRADE_OUTCOME_LABELS } from './grade-outcome-buttons';

function confirmText(outcome: GradingOutcome): string {
  return `«${GRADE_OUTCOME_LABELS[outcome]}» поставлено, ученик получил уведомление.`;
}

export async function saveGradingAndReply(
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  chatId: number,
  attemptId: string,
  outcome: GradingOutcome,
  comment: string | undefined,
  grader: UserLean,
  now: DateTime,
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  let dto;
  try {
    dto = await examBot.gradeAttempt(attemptId, grader.id, { outcome, comment }, now);
  } catch (err) {
    await reply(examUserFacingError(err)).catch(() => null);
    return;
  }

  await botSessions.clear(chatId);
  if (!dto) {
    await reply(GRADE_ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
    return;
  }
  await reply(confirmText(outcome)).catch(() => null);
}
