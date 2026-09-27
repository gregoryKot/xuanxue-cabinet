// Отправка видео вопроса/варианта (2026-09-27, «Уточнено» ADR-0133: владелец
// сообщил, что видео не видно ни в вопросе, ни в вариантах) — файл-лимит
// CLAUDE.md увёл это из exam-question-album-send.ts (там же — картинки,
// тот же образец: bytes/file_id через ExamBotPort, кэш file_id, деградация
// без исключения). Ссылка (YouTube и т.п.) — отдельным сообщением с
// превью, не через ExamBotPort: файла нет, скачивать и слать нечего.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { InputFile } from 'telegraf/types';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { errorMessage } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import type { BotOptionVideo, ExamBotPort } from '../exam-bot.port';
import type { VideoAlbumEntry, VideoLinkAlbumEntry } from './exam-question-album';

const logger = new Logger('examOptionVideo');

const CONTENT_TYPE_EXTENSION: Record<ExamVideoContentType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function toInputFile(entry: VideoAlbumEntry, video: BotOptionVideo): InputFile {
  const ext = CONTENT_TYPE_EXTENSION[video.contentType];
  const name =
    entry.optionIndex === undefined ? 'question' : `variant-${entry.optionIndex + 1}`;
  return { source: video.bytes, filename: `${name}.${ext}` };
}

// SECURITY §1: attemptId/videoId — полями объекта, не в тексте строки.
function warn(
  attemptId: string,
  entry: VideoAlbumEntry,
  reason: string,
  err?: unknown,
): void {
  logger.warn(
    `telegram.examOptionVideo: ${reason}${err ? `: ${errorMessage(err)}` : ''}`,
    {
      attemptId,
      videoId: entry.videoId,
    },
  );
}

/** `sent: false` — не ушло вовсе; `newFileId` — только когда видео реально
 * ушло байтами (первый раз или после отказа кэша), писать в базу то же
 * значение, которым уже отправляли, незачем (тот же приём, что у картинки,
 * exam-question-album-send.ts). Второй и последний раз пробуем байтами,
 * если file_id, которым Telegram отказался слать (сменили бота). */
async function sendBytesOrFileId(
  ctx: Context,
  chatId: number,
  entry: VideoAlbumEntry,
  video: BotOptionVideo,
  attemptId: string,
): Promise<{ sent: true; newFileId: string | null } | { sent: false }> {
  const hadCachedFileId = Boolean(video.telegramFileId);
  const caption = entry.caption ? { caption: entry.caption } : {};
  try {
    const media = hadCachedFileId
      ? (video.telegramFileId as string)
      : toInputFile(entry, video);
    const sent = await ctx.telegram.sendVideo(chatId, media, caption);
    return { sent: true, newFileId: hadCachedFileId ? null : sent.video.file_id };
  } catch (err) {
    if (!hadCachedFileId) {
      warn(attemptId, entry, 'сбой отправки', err);
      return { sent: false };
    }
  }
  try {
    const sent = await ctx.telegram.sendVideo(chatId, toInputFile(entry, video), caption);
    return { sent: true, newFileId: sent.video.file_id };
  } catch (retryErr) {
    warn(attemptId, entry, 'сбой отправки байтами после отказа file_id', retryErr);
    return { sent: false };
  }
}

/** Одно видео — от чтения байтов (или доступа к ним) до отправки и кэша
 * file_id. `false` — видео не показано (R2 выключен, объект пропал, доступа
 * нет, сбой отправки): вызывающий код («Ноль нагрузки на ученика») решает,
 * нужна ли текстовая отметка про кабинет — сейчас только для видео самого
 * вопроса (exam-question-render.ts). */
export async function sendOptionVideo(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  chatId: number,
  entry: VideoAlbumEntry,
  attemptId: string,
  now: DateTime,
): Promise<boolean> {
  let video: BotOptionVideo | null;
  try {
    video = await examBot.loadOptionVideo(entry.videoId, user, now);
  } catch (err) {
    warn(attemptId, entry, 'сбой чтения', err);
    return false;
  }
  if (!video) {
    warn(attemptId, entry, 'недоступно (R2 выключен, объект пропал или не своё)');
    return false;
  }
  const outcome = await sendBytesOrFileId(ctx, chatId, entry, video, attemptId);
  if (!outcome.sent) return false;
  if (outcome.newFileId) {
    await examBot
      .rememberVideoFileId(entry.videoId, outcome.newFileId)
      .catch((err: unknown) =>
        warn(attemptId, entry, 'не удалось запомнить file_id', err),
      );
  }
  return true;
}

/** Ссылка (YouTube и т.п.) — отдельным сообщением с превью, не текстом внутри
 * экрана вопроса (2026-09-27, «Уточнено» ADR-0133): у варианта — с префиксом
 * «Вариант N», у вопроса — голой ссылкой. `link_preview_options.is_disabled:
 * false` — иначе Telegram не показывает плеер YouTube под ссылкой. */
export async function sendVideoLink(
  ctx: Context,
  chatId: number,
  entry: VideoLinkAlbumEntry,
): Promise<void> {
  const text = entry.caption ? `${entry.caption}: ${entry.url}` : entry.url;
  await ctx.telegram
    .sendMessage(chatId, text, {
      link_preview_options: { is_disabled: false, url: entry.url },
    })
    .catch(() => null); // ссылка — не более важна, чем сам экран вопроса, ушедший следом
}
