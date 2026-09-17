// Текст DM учителю/помощнику «ученик сдал работу» (слой 4.7, PLAN §11;
// расширено слоем 4б.5, PLAN §12: ответы по вопросам прямо в сообщении, чтобы
// автопроверенное учитель видел без похода в кабинет). Источник —
// AttemptReviewDto, та же карточка `GET /attempts/:id/review`
// (ExamGradingsService.getReview через ExamBotPort.loadAttemptReview), не
// вторая сборка; построчная сводка ответов — attempt-answers-summary.ts.
// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты», образец —
// broadcast-cancel-message.ts). Ссылка на карточку проверки строится от
// `PUBLIC_URL`: без него — сообщение без ссылки, не «undefined» в тексте
// (ADR-0009: ссылки только от PUBLIC_URL, не от заголовка Host).
import type { AttemptReviewDto } from '@xuanxue/shared';
import { attemptAnswersSummary } from './attempt-answers-summary';

export function attemptSubmittedMessage(
  review: AttemptReviewDto,
  publicUrl: string | undefined,
): string {
  const link = publicUrl ? `${publicUrl}/grading/${review.attemptId}` : undefined;
  // «Работа от {имя}», не «{имя} сдал(а)» — глагол прошедшего времени
  // требовал бы знать пол ученика, которого в данных нет (UserLean).
  const header = `Работа от ${review.userName} по «${review.examTitle}» — ждёт вашей проверки.`;
  const body = attemptAnswersSummary(review.blocks, review.media ?? [], link);
  const footer = link ? `Открыть в кабинете: ${link}` : undefined;
  return [header, body, footer]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}
