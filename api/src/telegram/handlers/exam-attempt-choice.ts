// Сохранение выбранного варианта — вынесено из exam-attempt-answer.ts
// файл-лимитом CLAUDE.md «Храповики», когда multiple ушёл в toggleOption (F27).
import type { DateTime } from 'luxon';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { ExamBotPort } from '../exam-bot.port';

/** `single` — выбор отвечает на вопрос целиком и заменяет прошлый выбор;
 * `multiple` — переключатель, и «отмечен/снят» считает сервер по
 * перечитанным ответам внутри CAS (ExamBotPort.toggleOption, аудит
 * 2026-10-01, F27): два быстрых нажатия А и Б давали [Б], когда оба
 * хендлера читали пустой ответ до сохранения. Существующий text (объяснение
 * выбора, ADR-0146) оба пути сохраняют как есть. */
export function saveChoice(
  examBot: ExamBotPort,
  user: UserLean,
  attemptId: string,
  attempt: ExamAttemptDto,
  question: AttemptQuestionDto,
  optionId: string,
  now: DateTime,
): Promise<ExamAttemptDto> {
  const itemId = question.itemId;
  if (question.kind === 'multiple') {
    return examBot.toggleOption(attemptId, user, { itemId, optionId }, now);
  }
  const text = attempt.answers.find((a) => a.itemId === itemId)?.text;
  return examBot.saveAnswer(
    attemptId,
    user,
    { itemId, optionIds: [optionId], ...(text !== undefined ? { text } : {}) },
    now,
  );
}
