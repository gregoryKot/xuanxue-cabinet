// Ссылка на видео (YouTube и т.п.) вопроса/варианта — отдельным сообщением с
// превью, не через ExamBotPort: файла нет, скачивать и слать нечего
// (2026-09-27, «Уточнено» ADR-0133). Вынесено из exam-question-video-send.ts
// файл-лимитом CLAUDE.md «Храповики», когда тот взял ленивые байты (F02).
import type { Context } from 'telegraf';
import type { VideoLinkAlbumEntry } from './exam-question-album';

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
