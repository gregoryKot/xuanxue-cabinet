// Отправка медиа вопроса и вариантов (ADR-0118, ADR-0035, ADR-0133, docs/PLAN.md
// §12 слой 4б.2) — сборка списка в exam-question-album.ts (файл-лимит CLAUDE.md),
// здесь только перебор общего списка в порядке ADR-0133 и вызов нужного
// отправителя по `kind`: картинки — exam-question-photo-send.ts, видео и
// ссылки — exam-question-video-send.ts (оба вынесены тем же файл-лимитом).
// Экран вопроса показываем в любом случае, кнопки «Вариант N» работают и без
// медиа (CLAUDE.md «Ноль нагрузки»).
//
// Порядок — последовательно (`for … of`, не `Promise.all`): Telegram держит
// порядок сообщений только при последовательной отправке.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import type { ExamBotPort } from '../exam-bot.port';
import type { ImageAlbumEntry, OptionAlbumEntry } from './exam-question-album';
import { rememberFileId, resolveImages, sendOnePhoto } from './exam-question-photo-send';
import { sendOptionVideo, sendVideoLink } from './exam-question-video-send';

const logger = new Logger('examOptionAlbum');

/** Перед экраном кнопок вопроса — медиа вопроса и вариантов, каждое своим
 * сообщением (ADR-0118, ADR-0133, PLAN.md §12 слой 4б.2), в исходном порядке
 * списка (exam-question-album.ts): картинки резолвятся заранее одним
 * Promise.all (как раньше), видео и ссылки — прямо по ходу цикла, поэтому
 * порядок отправки не зависит от того, когда именно резолвится картинка.
 * Сбой — деградация, не отказ: экран показывает вызывающий код в любом
 * случае. `questionVideoFailed` — не удалось показать видео САМОГО вопроса
 * (R2 выключено, объект пропал, сбой отправки) — вызывающий код
 * (exam-question-render.ts) решает, показывать ли отметку «видео в кабинете». */
export async function sendOptionAlbum(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  chatId: number,
  album: OptionAlbumEntry[],
  attemptId: string,
  now: DateTime,
): Promise<{ questionVideoFailed: boolean }> {
  if (album.length === 0) return { questionVideoFailed: false };

  const imageEntries = album.filter(
    (entry): entry is ImageAlbumEntry => entry.kind === 'image',
  );
  // Сбой чтения байтов (Mongo, шифрование) — тоже деградация: к этому
  // моменту старое сообщение-экран уже удалено (presentAttemptScreen), и
  // упавшее исключение оставило бы ученика вовсе без экрана.
  let resolvedImages: Awaited<ReturnType<typeof resolveImages>> = [];
  if (imageEntries.length > 0) {
    try {
      resolvedImages = await resolveImages(examBot, user, imageEntries);
    } catch (err) {
      logger.warn(`telegram.examOptionAlbum.load: ${errorMessage(err)}`, { attemptId });
    }
  }
  const imageByEntry = new Map(resolvedImages.map((r) => [r.entry, r.image]));

  let questionVideoFailed = false;
  for (const entry of album) {
    if (entry.kind === 'image') {
      const image = imageByEntry.get(entry);
      if (!image) continue; // не нашлась — без шума (лог уже был выше при сбое чтения)
      const result = await sendOnePhoto(ctx, chatId, { entry, image }, attemptId);
      if (!result) continue;
      await rememberFileId(examBot, entry, result.sent, result.sentWithBytes).catch(
        (err: unknown) =>
          logger.warn(`telegram.examOptionAlbum.remember: ${errorMessage(err)}`, {
            attemptId,
            imageId: entry.imageId,
          }),
      );
    } else if (entry.kind === 'video') {
      const sent = await sendOptionVideo(
        ctx,
        examBot,
        user,
        chatId,
        entry,
        attemptId,
        now,
      );
      if (!sent && entry.optionIndex === undefined) questionVideoFailed = true;
    } else {
      await sendVideoLink(ctx, chatId, entry);
    }
  }
  return { questionVideoFailed };
}
