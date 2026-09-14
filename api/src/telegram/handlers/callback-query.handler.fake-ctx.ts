// Фейковый ctx для callback-query.handler.*.spec.ts — отдельным файлом тем же
// приёмом, что message.handler.fake-ctx.ts: обвязка с Mongo
// (callback-query.handler.test-support.ts) держится в лимите 150 строк, а
// фейк контекста нужен и спекам без базы.
import type { Context } from 'telegraf';

export function fakeCtx(options: {
  chatId?: number;
  chatType?: 'private' | 'group';
  data?: string;
  noFrom?: boolean;
  /** Правку сообщения отклонили (его удалили, бота выкинули). */
  failEdit?: boolean;
}): { ctx: Context; editCalls: string[] } {
  const editCalls: string[] = [];
  const ctx = {
    chat:
      options.chatId === undefined
        ? undefined
        : { id: options.chatId, type: options.chatType ?? 'private' },
    from:
      options.chatId === undefined || options.noFrom ? undefined : { id: options.chatId },
    callbackQuery: options.data === undefined ? undefined : { data: options.data },
    answerCbQuery: () => Promise.resolve(true),
    editMessageText: (text: string) =>
      options.failEdit
        ? Promise.reject(new Error('сообщение недоступно'))
        : Promise.resolve(Boolean(editCalls.push(text))),
    reply: (text: string) => Promise.resolve(Boolean(editCalls.push(text))),
  } as unknown as Context;
  return { ctx, editCalls };
}
