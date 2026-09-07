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
}): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const message = messageOf(options);
  const ctx = {
    chat:
      options.chatId === undefined
        ? undefined
        : { id: options.chatId, type: options.chatType ?? 'private' },
    from:
      options.chatId === undefined || options.noFrom ? undefined : { id: options.chatId },
    message,
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, replies };
}

function messageOf(options: {
  text?: string;
  videoFileId?: string;
  documentFileId?: string;
  documentMimeType?: string;
}): unknown {
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
