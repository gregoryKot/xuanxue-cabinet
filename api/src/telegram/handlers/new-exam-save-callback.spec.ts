// «Опубликовать» диалога «Собрать экзамен» (ТЗ 4б.4) — фейковые
// BotSessionService/ExamBotPort/UsersService, без Mongo (счастливый путь и
// идемпотентность — интеграционный new-exam-flow.spec.ts): здесь —
// пользователь не найден и неожиданный сбой ExamBotPort.createAndPublishExam.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { ExamDto } from '@xuanxue/shared';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { UsersService } from '../../users/users.service';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import { handleNewExamPublish } from './new-exam-save-callback';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function confirmSession(): BotSessionLean {
  return {
    kind: 'examBuildDraft',
    buildStep: 'confirm',
    buildItemIds: [],
    buildTitle: 'Экзамен по форме',
    buildAttemptsAllowed: 1,
  };
}

describe('handleNewExamPublish', () => {
  it('черновик не проходит DTO-лимит — ошибка на экране, ExamsService не зовём', async () => {
    const port = fakeExamBotPort({
      validateExamDraft: jest
        .fn()
        .mockResolvedValue(['Название: не длиннее 200 символов.']),
    });
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = { findByTelegramId: jest.fn() } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits[0]).toContain('Название: не длиннее 200 символов.');
    expect(port.createAndPublishExam).not.toHaveBeenCalled();
  });

  it('пользователь не найден по telegramId — ошибка на экране, ExamsService не зовём', async () => {
    const port = fakeExamBotPort();
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = {
      findByTelegramId: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits[0]).toContain('Не нашли ваш аккаунт');
    expect(port.createAndPublishExam).not.toHaveBeenCalled();
  });

  it('ExamsService.createAndPublishExam упал неожиданно — фраза в чат, черновик не очищается', async () => {
    const port = fakeExamBotPort({
      createAndPublishExam: jest.fn().mockRejectedValue(new Error('Mongo недоступна')),
    });
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = {
      findByTelegramId: jest.fn().mockResolvedValue({ id: 'u1' }),
    } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await expect(
      handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW),
    ).resolves.toBeUndefined();

    expect(edits[0]).toBe('Что-то пошло не так. Попробуйте ещё раз.');
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('успех — savedExamId записывается в тот же черновик, не очищая сессию', async () => {
    const exam: ExamDto = {
      id: '507f1f77bcf86cd799439011',
      title: 'Экзамен по форме',
      description: '',
      level: '',
      blocks: [],
      shuffleOptions: false,
      attemptsAllowed: 1,
      status: 'published',
      createdAt: NOW.toISO() ?? '',
      updatedAt: NOW.toISO() ?? '',
    };
    const port = fakeExamBotPort({
      createAndPublishExam: jest.fn().mockResolvedValue(exam),
    });
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(confirmSession()),
    });
    const users = {
      findByTelegramId: jest.fn().mockResolvedValue({ id: 'u1' }),
    } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'confirm', savedExamId: exam.id },
      NOW,
    );
    expect(edits[0]).toContain('Экзамен опубликован');
  });

  it('повторный клик — ссылка на уже опубликованный, ExamsService не зовём', async () => {
    const port = fakeExamBotPort();
    const session = confirmSession();
    session.buildSavedExamId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const users = { findByTelegramId: jest.fn() } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits[0]).toContain('уже опубликован');
    expect(port.createAndPublishExam).not.toHaveBeenCalled();
  });

  it('шаг ещё не «confirm» (защита в глубину) — игнорируется, ExamsService не зовём', async () => {
    const port = fakeExamBotPort();
    const session = confirmSession();
    session.buildStep = 'attempts';
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const users = { findByTelegramId: jest.fn() } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits).toEqual([]);
    expect(port.createAndPublishExam).not.toHaveBeenCalled();
  });

  it('черновика нет (кнопка нажата после TTL) — тихо игнорируется', async () => {
    const port = fakeExamBotPort();
    const botSessions = fakeBotSessionService({ get: jest.fn().mockResolvedValue(null) });
    const users = { findByTelegramId: jest.fn() } as unknown as UsersService;
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPublish(ctx, botSessions, port, users, undefined, CHAT_ID, NOW);

    expect(edits).toEqual([]);
  });
});
