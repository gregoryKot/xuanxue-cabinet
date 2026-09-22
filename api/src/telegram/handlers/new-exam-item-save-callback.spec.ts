// «Сохранить» диалога «Новый вопрос» (ТЗ 4б.3) — фейковые BotSessionService/
// ExamBotPort/UsersService, без Mongo (счастливый путь и идемпотентность —
// интеграционный new-exam-item-flow.spec.ts): здесь — пользователь не
// найден и неожиданный сбой ExamBotPort.createExamItem.
import { DateTime } from 'luxon';
import type { ExamItemDto } from '@xuanxue/shared';
import type { BotSessionLean } from '../bot-session.lean';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { UsersService } from '../../users/users.service';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import { handleNewExamItemSave } from './new-exam-item-save-callback';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function confirmSession(): BotSessionLean {
  return {
    kind: 'examItemDraft',
    draftKind: 'text',
    draftStep: 'confirm',
    draftPrompt: 'Опишите форму',
    draftOptions: [],
  };
}

describe('handleNewExamItemSave', () => {
  it('пользователь не найден по telegramId — ошибка на экране, ExamItemsService не зовём', async () => {
    const port = fakeExamBotPort();
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = {
      findByTelegramId: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemSave(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits[0]).toContain('Не нашли ваш аккаунт');
    expect(port.createExamItem).not.toHaveBeenCalled();
  });

  it('ExamItemsService.create упал неожиданно — фраза в чат, черновик не очищается', async () => {
    const port = fakeExamBotPort({
      createExamItem: jest.fn().mockRejectedValue(new Error('Mongo недоступна')),
    });
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = {
      findByTelegramId: jest.fn().mockResolvedValue({ id: 'u1' }),
    } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await expect(
      handleNewExamItemSave(ctx, botSessions, port, users, undefined, CHAT_ID, NOW),
    ).resolves.toBeUndefined();

    expect(edits[0]).toBe('Не получилось. Откройте /menu и попробуйте ещё раз.');
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('успех — savedItemId записывается в тот же черновик, не очищая сессию', async () => {
    const item: ExamItemDto = {
      id: '507f1f77bcf86cd799439011',
      kind: 'text',
      prompt: 'Опишите форму',
      options: [],
      tags: [],
      status: 'published',
      version: 1,
      history: [],
      createdAt: NOW.toISO() ?? '',
      updatedAt: NOW.toISO() ?? '',
    };
    const port = fakeExamBotPort({ createExamItem: jest.fn().mockResolvedValue(item) });
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = {
      findByTelegramId: jest.fn().mockResolvedValue({ id: 'u1' }),
    } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemSave(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(botSessions.setNewExamItemDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'confirm', savedItemId: item.id },
      NOW,
    );
    expect(edits[0]).toContain('Вопрос сохранён');
  });

  it('черновика нет (кнопка нажата после TTL) — тихо игнорируется', async () => {
    const port = fakeExamBotPort();
    const botSessions = fakeBotSessionService({ get: jest.fn().mockResolvedValue(null) });
    const users = { findByTelegramId: jest.fn() } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemSave(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits).toEqual([]);
  });
});
