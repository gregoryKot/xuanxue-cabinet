// Картинка/видео вопроса и варианта для бота — вынесено из
// exam-bot.service.ts (файл-лимит CLAUDE.md «Храповики»): перевод
// NotFoundError/NotAvailableError в `null` отдельно от остальных методов
// сервиса, тем же приёмом, что exam-attempt-media.ts для withAttemptMedia/
// withReviewMedia.
import type { DateTime } from 'luxon';
import { NotAvailableError, NotFoundError } from '../common/errors';
import type { ExamImagesService } from '../exam-images/exam-images.service';
import type { ExamVideosService } from '../exam-videos/exam-videos.service';
import type { BotOptionImage, BotOptionVideo } from '../telegram/exam-bot.port';
import type { UserLean } from '../users/users.service';

/** ExamImagesService.load бросает NotFoundError и штату (не своя картинка не
 * бывает — доступ по роли), и ученику (не в снимке его попытки) — здесь это
 * `null`, комментарий у ExamBotPort.loadOptionImage. */
export async function loadOptionImageForBot(
  examImagesService: ExamImagesService,
  imageId: string,
  user: UserLean,
): Promise<BotOptionImage | null> {
  try {
    return await examImagesService.load(imageId, user);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

/** `null` — то же самое, что у loadOptionImageForBot выше, плюс
 * NotAvailableError: R2 выключен или объект пропал (FileStoreService.get) —
 * деградация показа, не отказ (ADR-0133 «Уточнено» 2026-09-27). */
export async function loadOptionVideoForBot(
  examVideosService: ExamVideosService,
  videoId: string,
  user: UserLean,
  now: DateTime,
): Promise<BotOptionVideo | null> {
  try {
    return await examVideosService.loadForBot(videoId, user, now);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof NotAvailableError) return null;
    throw err;
  }
}
