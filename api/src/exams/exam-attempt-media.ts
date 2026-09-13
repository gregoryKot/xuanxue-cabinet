// Подмешивает media в ExamAttemptDto/AttemptReviewDto — контроллер
// делегирует сюда, а не собирает сам (CLAUDE.md «Логика вне контроллеров»,
// PLAN §11 слой 4.5). MediaAssetsService живёт в своём модуле (media/) —
// импортируем только тип: инстанс приходит от ExamAttemptsController через DI.
import type { AttemptReviewDto, ExamAttemptDto } from '@xuanxue/shared';
import type { MediaAssetsService } from '../media/media-assets.service';

export async function withAttemptMedia(
  service: MediaAssetsService,
  attempt: ExamAttemptDto,
): Promise<ExamAttemptDto> {
  const media = await service.listForAttempt(attempt.id);
  return { ...attempt, media };
}

/** Список попыток учителя (`GET /attempts`) — один запрос на всех, не N+1. */
export async function withAttemptsMedia(
  service: MediaAssetsService,
  attempts: ExamAttemptDto[],
): Promise<ExamAttemptDto[]> {
  const byAttempt = await service.listForAttempts(attempts.map((a) => a.id));
  return attempts.map((attempt) => ({
    ...attempt,
    media: byAttempt.get(attempt.id) ?? [],
  }));
}

export async function withReviewMedia(
  service: MediaAssetsService,
  review: AttemptReviewDto,
): Promise<AttemptReviewDto> {
  const media = await service.listForAttempt(review.attemptId);
  return { ...review, media };
}
