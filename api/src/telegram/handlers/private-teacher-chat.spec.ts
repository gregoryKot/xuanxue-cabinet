// Чистая логика с фейковым PersonalChats (без Mongo — сама выборка проверена
// в personal-chats.spec.ts, CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { PersonalChat, PersonalChats } from '../personal-chats';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const CHAT: PersonalChat = { chatId: '111', userId: 'u1', name: 'Мария' };

function fakePersonalChats(chats: PersonalChat[] = [CHAT]): PersonalChats {
  return { list: jest.fn().mockResolvedValue(chats) } as unknown as PersonalChats;
}

function ctxOf(
  chatId: number | undefined,
  chatType: 'private' | 'group' = 'private',
): Context {
  return {
    chat: chatId === undefined ? undefined : { id: chatId, type: chatType },
  } as Context;
}

describe('resolvePrivatePersonalChatId', () => {
  it('личный чат подключённого учителя — возвращает chatId', async () => {
    const chatId = await resolvePrivatePersonalChatId(
      ctxOf(111),
      fakePersonalChats(),
      NOW,
    );
    expect(chatId).toBe(111);
  });

  it('групповой чат — null', async () => {
    const chatId = await resolvePrivatePersonalChatId(
      ctxOf(111, 'group'),
      fakePersonalChats(),
      NOW,
    );
    expect(chatId).toBeNull();
  });

  it('нет ctx.chat — null', async () => {
    const chatId = await resolvePrivatePersonalChatId(
      ctxOf(undefined),
      fakePersonalChats(),
      NOW,
    );
    expect(chatId).toBeNull();
  });

  it('чат не в PersonalChats.list (чужой/не подключён) — null', async () => {
    const chatId = await resolvePrivatePersonalChatId(
      ctxOf(999),
      fakePersonalChats([CHAT]),
      NOW,
    );
    expect(chatId).toBeNull();
  });
});
