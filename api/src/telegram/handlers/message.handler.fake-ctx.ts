// fakeCtx/messageOf — вынесены из message.handler.test-support.ts (файл-лимит
// 150 строк, CLAUDE.md «Храповики»): три спека message.handler.*.spec.ts
// собирают Telegraf-контекст одинаково, обвязка общая, чтобы не дублировать
// (jscpd).
import type { Context } from 'telegraf';

export function fakeCtx(options: {
  chatId?: number;
  chatType?: 'private' | 'group';
  text?: string;
  noFrom?: boolean;
  videoFileId?: string;
  documentFileId?: string;
  documentMimeType?: string;
  /** Ответ (reply) на вопрос бота с кнопкой «Записи не будет» этого занятия. */
  replyToNorecLessonId?: string;
}): { ctx: Context; replies: string[]; replyMarkups: unknown[] } {
  const replies: string[] = [];
  const replyMarkups: unknown[] = [];
  const message = messageOf(options);
  const ctx = {
    chat:
      options.chatId === undefined
        ? undefined
        : { id: options.chatId, type: options.chatType ?? 'private' },
    from:
      options.chatId === undefined || options.noFrom ? undefined : { id: options.chatId },
    message,
    reply: (text: string, extra?: { reply_markup?: { inline_keyboard?: unknown } }) => {
      replies.push(text);
      replyMarkups.push(extra?.reply_markup?.inline_keyboard);
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, replies, replyMarkups };
}

function messageOf(options: {
  text?: string;
  videoFileId?: string;
  documentFileId?: string;
  documentMimeType?: string;
  replyToNorecLessonId?: string;
}): unknown {
  const content = contentOf(options);
  if (!content || options.replyToNorecLessonId === undefined) return content;
  return {
    ...content,
    reply_to_message: {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Записи не будет',
              callback_data: `norec:${options.replyToNorecLessonId}`,
            },
          ],
        ],
      },
    },
  };
}

function contentOf(options: {
  text?: string;
  videoFileId?: string;
  documentFileId?: string;
  documentMimeType?: string;
}): object | undefined {
  if (options.text !== undefined) return { text: options.text };
  if (options.videoFileId !== undefined)
    return { video: { file_id: options.videoFileId } };
  if (options.documentFileId !== undefined) {
    return {
      document: { file_id: options.documentFileId, mime_type: options.documentMimeType },
    };
  }
  return undefined;
}
