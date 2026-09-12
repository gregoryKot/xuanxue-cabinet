// Чистая логика с фейковым TeacherChats (без Mongo — сама выборка проверена
// в teacher-chats.spec.ts, CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { TeacherChat, TeacherChats } from '../teacher-chats';
import { resolvePrivateTeacherChatId } from './private-teacher-chat';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const CHAT: TeacherChat = { chatId: '111', userId: 'u1', name: 'Мария' };

function fakeTeacherChats(chats: TeacherChat[] = [CHAT]): TeacherChats {
  return { list: jest.fn().mockResolvedValue(chats) } as unknown as TeacherChats;
}

function ctxOf(
  chatId: number | undefined,
  chatType: 'private' | 'group' = 'private',
): Context {
  return {
    chat: chatId === undefined ? undefined : { id: chatId, type: chatType },
  } as Context;
}

describe('resolvePrivateTeacherChatId', () => {
  it('личный чат подключённого учителя — возвращает chatId', async () => {
    const chatId = await resolvePrivateTeacherChatId(ctxOf(111), fakeTeacherChats(), NOW);
    expect(chatId).toBe(111);
  });

  it('групповой чат — null', async () => {
    const chatId = await resolvePrivateTeacherChatId(
      ctxOf(111, 'group'),
      fakeTeacherChats(),
      NOW,
    );
    expect(chatId).toBeNull();
  });

  it('нет ctx.chat — null', async () => {
    const chatId = await resolvePrivateTeacherChatId(
      ctxOf(undefined),
      fakeTeacherChats(),
      NOW,
    );
    expect(chatId).toBeNull();
  });

  it('чат не в TeacherChats.list (чужой/не подключён) — null', async () => {
    const chatId = await resolvePrivateTeacherChatId(
      ctxOf(999),
      fakeTeacherChats([CHAT]),
      NOW,
    );
    expect(chatId).toBeNull();
  });
});
