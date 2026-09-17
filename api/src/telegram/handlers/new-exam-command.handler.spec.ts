// /экзамен (ТЗ 4б.4) — фейковый PersonalChats/ExamBotPort/BotSessionService,
// без Mongo (тем же приёмом, что new-exam-item-command.handler.spec.ts):
// личный чат штата видит шаг 'pick' и заводит сессию, чужой чат и сбой
// резолва — бот молчит, апдейт не падает, пустой список вопросов не заводит
// черновик.
import { DateTime } from 'luxon';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { PersonalChats } from '../personal-chats';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import { NewExamCommandHandler } from './new-exam-command.handler';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function fakePersonalChats(list: PersonalChats['list']): PersonalChats {
  return { list } as unknown as PersonalChats;
}

function fakeItem(id: string): ExamItemDto {
  return {
    id,
    kind: 'text',
    prompt: 'Опишите форму',
    options: [],
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-09-17T10:00:00Z',
    updatedAt: '2026-09-17T10:00:00Z',
  };
}

function buildRegistry(items: ExamItemDto[]): ExamBotPortRegistry {
  const registry = new ExamBotPortRegistry();
  registry.set(
    fakeExamBotPort({ listExamItemsToAssemble: jest.fn().mockResolvedValue(items) }),
  );
  return registry;
}

describe('NewExamCommandHandler', () => {
  it('штат, есть опубликованные вопросы — шаг pick, сессия заведена', async () => {
    const botSessions = fakeBotSessionService();
    const handler = new NewExamCommandHandler(
      fakePersonalChats(
        jest
          .fn()
          .mockResolvedValue([{ chatId: String(CHAT_ID), userId: 'u1', name: 'x' }]),
      ),
      buildRegistry([fakeItem('item-1')]),
      botSessions,
    );
    const { ctx, replies } = fakeFlowCtx();

    await handler.handle(ctx, NOW);

    expect(replies[0]).toContain('Отметьте вопросы');
    expect(botSessions.startNewExamDraft).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('штат, нет опубликованных вопросов — отказ с действием, сессия не заводится', async () => {
    const botSessions = fakeBotSessionService();
    const handler = new NewExamCommandHandler(
      fakePersonalChats(
        jest
          .fn()
          .mockResolvedValue([{ chatId: String(CHAT_ID), userId: 'u1', name: 'x' }]),
      ),
      buildRegistry([]),
      botSessions,
    );
    const { ctx, replies } = fakeFlowCtx();

    await handler.handle(ctx, NOW);

    expect(replies[0]).toContain('Нет опубликованных вопросов');
    expect(botSessions.startNewExamDraft).not.toHaveBeenCalled();
  });

  it('не штат — бот молчит', async () => {
    const handler = new NewExamCommandHandler(
      fakePersonalChats(jest.fn().mockResolvedValue([])),
      buildRegistry([fakeItem('item-1')]),
      fakeBotSessionService(),
    );
    const { ctx, replies } = fakeFlowCtx();

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('сбой резолва доступа — бот молчит, апдейт не падает', async () => {
    const handler = new NewExamCommandHandler(
      fakePersonalChats(jest.fn().mockRejectedValue(new Error('Mongo недоступна'))),
      buildRegistry([fakeItem('item-1')]),
      fakeBotSessionService(),
    );
    const { ctx, replies } = fakeFlowCtx();

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});
