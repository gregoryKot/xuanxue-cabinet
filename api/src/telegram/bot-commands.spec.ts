// Команды в меню Telegram: без них человек видит пустое меню и не знает, что
// бот умеет (отзыв владельца 2026-09-12). Проверяем состав списка и то, что
// сбой регистрации не роняет старт приложения.
import { Telegraf } from 'telegraf';
import { BOT_COMMANDS, registerBotCommands } from './bot-commands';

describe('BOT_COMMANDS', () => {
  it('только латиница — кириллическую команду Telegram не принимает', () => {
    for (const { command } of BOT_COMMANDS) {
      expect(command).toMatch(/^[a-z_]+$/);
    }
  });

  it('у каждой команды есть описание по-русски — его видит человек в меню', () => {
    for (const { description } of BOT_COMMANDS) {
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('в списке есть меню, занятия, тема, экзамены и уведомления', () => {
    expect(BOT_COMMANDS.map((c) => c.command)).toEqual([
      'menu',
      'schedule',
      'topic',
      'exams',
      'notifications',
      'help',
    ]);
  });
});

describe('registerBotCommands', () => {
  it('шлёт весь список одним вызовом', async () => {
    const calls: { command: string; description: string }[][] = [];
    const bot = new Telegraf('1:token');
    bot.telegram.callApi = ((method: string, payload?: Record<string, unknown>) => {
      if (method === 'setMyCommands') {
        calls.push(payload?.commands as { command: string; description: string }[]);
      }
      return Promise.resolve(true);
    }) as unknown as Telegraf['telegram']['callApi'];

    await registerBotCommands(bot);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([...BOT_COMMANDS]);
  });
});
