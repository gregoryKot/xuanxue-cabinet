// Фейковый Context Telegraf и пользователь-ученик для интеграционных спеков
// диалогов бота — вынесено из exam-attempt-flow.test-support.ts (файл-лимит
// CLAUDE.md «Храповики»): обвязка одна, спеки разные (jscpd).
import type { Context } from 'telegraf';
import type { UserLean } from '../../users/users.service';

export const CHAT_ID = 111;

// Фото для sendPhoto (ADR-0035, ADR-0118) — два размера, самый большой
// последним: exam-question-album-send.ts берёт file_id именно так.
const SENT_PHOTO_SIZES = [{ file_id: 'f-small' }, { file_id: 'f-big' }];

export function botUser(id: string): UserLean {
  return { id, name: 'Ученик', roles: [], status: 'active', studentMode: false };
}

export interface FlowFakeCtx {
  ctx: Context;
  edits: string[];
  replies: string[];
  buttonTexts: string[][];
  deletes: number[];
  sendPhotoCalls: unknown[][];
}

export function fakeFlowCtx(
  overrides: { text?: string; video?: boolean } = {},
): FlowFakeCtx {
  const edits: string[] = [];
  const replies: string[] = [];
  const buttonTexts: string[][] = [];
  const deletes: number[] = [];
  const sendPhotoCalls: unknown[][] = [];
  const captureButtons = (extra?: {
    reply_markup?: { inline_keyboard?: { text: string }[][] };
  }) =>
    buttonTexts.push(
      (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
    );
  const ctx = {
    chat: { id: CHAT_ID, type: 'private' },
    message: overrides.video
      ? { message_id: 1, video: { file_id: 'f1', file_unique_id: 'u1' } }
      : { message_id: 1, text: overrides.text ?? '' },
    editMessageText: (text: string, extra?: Parameters<typeof captureButtons>[0]) => {
      edits.push(text);
      captureButtons(extra);
      return Promise.resolve(true);
    },
    reply: (text: string, extra?: Parameters<typeof captureButtons>[0]) => {
      replies.push(text);
      captureButtons(extra);
      return Promise.resolve();
    },
    deleteMessage: () => {
      deletes.push(1);
      return Promise.resolve(true);
    },
    telegram: {
      sendMessage: () => Promise.resolve(),
      copyMessage: () => Promise.resolve(),
      sendPhoto: (chatId: number, media: unknown, extra: unknown) => {
        sendPhotoCalls.push([chatId, media, extra]);
        return Promise.resolve({ message_id: 900, photo: SENT_PHOTO_SIZES });
      },
    },
  } as unknown as Context;
  return {
    ctx,
    edits,
    replies,
    buttonTexts,
    deletes,
    sendPhotoCalls,
  };
}
