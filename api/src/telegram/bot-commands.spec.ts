// Команды в меню Telegram: без них человек видит пустое меню и не знает, что
// бот умеет (отзыв владельца 2026-09-12). Баг от 2026-09-21 («зашёл в бот с
// ученика — видны все команды и для учителя») — список раздваивается по
// scope; эти тесты проверяют состав обоих списков и то, что регистрация по
// scope шлёт ровно ожидаемое и не роняет старт при сбое сети.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Telegram } from 'telegraf';
import type { PersonalChat, PersonalChats } from './personal-chats';
import {
  STAFF_BOT_COMMANDS,
  STUDENT_BOT_COMMANDS,
  resetChatBotCommands,
  setStaffBotCommands,
  syncBotCommands,
} from './bot-commands';

const NOW = DateTime.utc(2026, 9, 21, 10, 0, 0);

// Штатные команды, которых ученик не должен видеть (регрессия 2026-09-21).
const STAFF_ONLY_COMMANDS = ['schedule', 'topic', 'newquestion', 'newexam', 'review'];

interface FakeTelegram {
  setCalls: { commands: unknown; scope: unknown }[];
  deleteCalls: unknown[];
  setMyCommands: (commands: unknown, extra?: { scope?: unknown }) => Promise<true>;
  deleteMyCommands: (extra?: { scope?: unknown }) => Promise<true>;
}

function fakeTelegram(): FakeTelegram {
  const setCalls: { commands: unknown; scope: unknown }[] = [];
  const deleteCalls: unknown[] = [];
  return {
    setCalls,
    deleteCalls,
    setMyCommands: (commands, extra) => {
      setCalls.push({ commands, scope: extra?.scope });
      return Promise.resolve(true);
    },
    deleteMyCommands: (extra) => {
      deleteCalls.push(extra?.scope);
      return Promise.resolve(true);
    },
  };
}

function fakePersonalChats(chats: PersonalChat[]): PersonalChats {
  return { list: () => Promise.resolve(chats) } as unknown as PersonalChats;
}

describe('STUDENT_BOT_COMMANDS / STAFF_BOT_COMMANDS', () => {
  it('только латиница — кириллическую команду Telegram не принимает', () => {
    for (const { command } of [...STUDENT_BOT_COMMANDS, ...STAFF_BOT_COMMANDS]) {
      expect(command).toMatch(/^[a-z_]+$/);
    }
  });

  it('у каждой команды есть описание по-русски — его видит человек в меню', () => {
    for (const { description } of [...STUDENT_BOT_COMMANDS, ...STAFF_BOT_COMMANDS]) {
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('штат видит все девять команд в нынешнем порядке', () => {
    expect(STAFF_BOT_COMMANDS.map((c) => c.command)).toEqual([
      'menu',
      'schedule',
      'topic',
      'exams',
      'newquestion',
      'newexam',
      'review',
      'notifications',
      'help',
    ]);
  });

  it('ученику показаны только команды, которые ему правда отвечают', () => {
    expect(STUDENT_BOT_COMMANDS.map((c) => c.command)).toEqual([
      'menu',
      'exams',
      'notifications',
      'help',
    ]);
  });

  // Регрессия 2026-09-21: раньше был один общий список на всех — ученик
  // видел и штатные команды, хотя их хендлеры ему молчат.
  it('в списке ученика нет ни одной штатной команды', () => {
    const studentCommands = STUDENT_BOT_COMMANDS.map((c) => c.command);
    for (const staffCommand of STAFF_ONLY_COMMANDS) {
      expect(studentCommands).not.toContain(staffCommand);
    }
  });

  it('всё, что видит ученик, видит и штат', () => {
    const staffCommands = STAFF_BOT_COMMANDS.map((c) => c.command);
    for (const { command } of STUDENT_BOT_COMMANDS) {
      expect(staffCommands).toContain(command);
    }
  });
});

describe('syncBotCommands', () => {
  it('ученический список — всем, пустой — в группы, штатный — каждому чату PersonalChats по порядку', async () => {
    const telegram = fakeTelegram();
    const personalChats = fakePersonalChats([
      { chatId: '111', userId: 'u1', name: 'Мария' },
      { chatId: '222', userId: 'u2', name: 'Дима' },
    ]);

    await syncBotCommands(telegram as unknown as Telegram, personalChats, NOW);

    expect(telegram.setCalls).toEqual([
      { commands: STUDENT_BOT_COMMANDS, scope: { type: 'all_private_chats' } },
      { commands: [], scope: { type: 'default' } },
      { commands: STAFF_BOT_COMMANDS, scope: { type: 'chat', chat_id: '111' } },
      { commands: STAFF_BOT_COMMANDS, scope: { type: 'chat', chat_id: '222' } },
    ]);
  });

  it('нет ни одного штатного чата — только два общих scope', async () => {
    const telegram = fakeTelegram();

    await syncBotCommands(telegram as unknown as Telegram, fakePersonalChats([]), NOW);

    expect(telegram.setCalls).toHaveLength(2);
  });

  it('сбой сети — не бросает наружу, только warn в лог', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const telegram = {
      setMyCommands: () => Promise.reject(new Error('сеть недоступна')),
    } as unknown as Telegram;

    await expect(
      syncBotCommands(telegram, fakePersonalChats([]), NOW),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('telegram.setMyCommands: сеть недоступна');
    warn.mockRestore();
  });
});

describe('setStaffBotCommands / resetChatBotCommands', () => {
  it('setStaffBotCommands — полный штатный список персонально на чат', async () => {
    const telegram = fakeTelegram();

    await setStaffBotCommands(telegram as unknown as Telegram, '555');

    expect(telegram.setCalls).toEqual([
      { commands: STAFF_BOT_COMMANDS, scope: { type: 'chat', chat_id: '555' } },
    ]);
  });

  it('resetChatBotCommands — снимает персональный список с чата', async () => {
    const telegram = fakeTelegram();

    await resetChatBotCommands(telegram as unknown as Telegram, '555');

    expect(telegram.deleteCalls).toEqual([{ type: 'chat', chat_id: '555' }]);
  });

  it('обе функции best-effort — сбой сети не бросает наружу', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failingTelegram = {
      setMyCommands: () => Promise.reject(new Error('сеть')),
      deleteMyCommands: () => Promise.reject(new Error('сеть')),
    } as unknown as Telegram;

    await expect(setStaffBotCommands(failingTelegram, '555')).resolves.toBeUndefined();
    await expect(resetChatBotCommands(failingTelegram, '555')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
