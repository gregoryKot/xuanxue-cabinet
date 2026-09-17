// Кнопки диалога «Собрать экзамен» (ТЗ 4б.4) — фейковый BotSessionService/
// ExamBotPort, без Mongo (полный диалог — интеграционный new-exam-flow.spec.ts):
// здесь защитные ветки — устаревшая кнопка/чужой шаг молча игнорируется.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import type { ExamItemDto } from '@xuanxue/shared';
import {
  handleNewExamAssemble,
  handleNewExamAttempts,
  handleNewExamCancel,
  handleNewExamPage,
  handleNewExamTimeLimit,
  handleNewExamToggleItem,
} from './new-exam-callback';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function fakeItem(id: string): ExamItemDto {
  return {
    id,
    kind: 'text',
    prompt: `Вопрос ${id}`,
    options: [],
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-09-17T10:00:00Z',
    updatedAt: '2026-09-17T10:00:00Z',
  };
}

describe('handleNewExamToggleItem — защита от устаревшей кнопки', () => {
  it('черновика нет — тихо игнорируется', async () => {
    const botSessions = fakeBotSessionService({ get: jest.fn().mockResolvedValue(null) });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamToggleItem(
      ctx,
      botSessions,
      fakeExamBotPort(),
      CHAT_ID,
      new Types.ObjectId().toString(),
      NOW,
    );

    expect(edits).toEqual([]);
  });

  it('шаг уже не «pick» — игнорируется, не переключает отметку', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'title' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamToggleItem(
      ctx,
      botSessions,
      fakeExamBotPort(),
      CHAT_ID,
      new Types.ObjectId().toString(),
      NOW,
    );

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('уже отмеченный вопрос — снимает отметку (deselect), не добавляет второй раз', async () => {
    const itemId = '507f1f77bcf86cd799439011';
    const session: BotSessionLean = {
      kind: 'examBuildDraft',
      buildStep: 'pick',
      buildItemIds: [new Types.ObjectId(itemId)],
      buildPage: 0,
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const port = fakeExamBotPort({
      listExamItemsToAssemble: jest.fn().mockResolvedValue([fakeItem(itemId)]),
    });
    const { ctx, buttonTexts } = fakeFlowCtx();

    await handleNewExamToggleItem(ctx, botSessions, port, CHAT_ID, itemId, NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'pick', itemIds: [], page: 0 },
      NOW,
    );
    expect(buttonTexts.flat()).toContain(`☐ Вопрос ${itemId}`);
  });

  it('buildPage/buildItemIds не заданы (черновик сразу после старта) — страница 0, первая отметка', async () => {
    const itemId = '507f1f77bcf86cd799439011';
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'pick' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const port = fakeExamBotPort({
      listExamItemsToAssemble: jest.fn().mockResolvedValue([fakeItem(itemId)]),
    });
    const { ctx } = fakeFlowCtx();

    await handleNewExamToggleItem(ctx, botSessions, port, CHAT_ID, itemId, NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'pick', itemIds: [itemId], page: 0 },
      NOW,
    );
  });
});

describe('handleNewExamPage — переключает страницу активной сборки', () => {
  it('«next» на первой странице — переходит на вторую, отметки сохраняются', async () => {
    const items = Array.from({ length: 8 }, (_, i) => fakeItem(`item-${i}`));
    const session: BotSessionLean = {
      kind: 'examBuildDraft',
      buildStep: 'pick',
      buildItemIds: [new Types.ObjectId()],
      buildPage: 0,
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const port = fakeExamBotPort({
      listExamItemsToAssemble: jest.fn().mockResolvedValue(items),
    });
    const { ctx, buttonTexts } = fakeFlowCtx();

    await handleNewExamPage(ctx, botSessions, port, CHAT_ID, 'next', NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'pick', itemIds: [session.buildItemIds?.[0]?.toString() ?? ''], page: 1 },
      NOW,
    );
    expect(buttonTexts.flat()).toContain('☐ Вопрос item-6');
  });

  it('«prev» со второй страницы (buildPage не задан на первом заходе — 0 по умолчанию)', async () => {
    const items = Array.from({ length: 8 }, (_, i) => fakeItem(`item-${i}`));
    const session: BotSessionLean = {
      kind: 'examBuildDraft',
      buildStep: 'pick',
      buildPage: 1,
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const port = fakeExamBotPort({
      listExamItemsToAssemble: jest.fn().mockResolvedValue(items),
    });
    const { ctx, buttonTexts } = fakeFlowCtx();

    await handleNewExamPage(ctx, botSessions, port, CHAT_ID, 'prev', NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'pick', itemIds: [], page: 0 },
      NOW,
    );
    expect(buttonTexts.flat()).toContain('☐ Вопрос item-0');
  });

  it('buildPage не задан — считается от страницы 0', async () => {
    const items = Array.from({ length: 8 }, (_, i) => fakeItem(`item-${i}`));
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'pick' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const port = fakeExamBotPort({
      listExamItemsToAssemble: jest.fn().mockResolvedValue(items),
    });
    const { ctx } = fakeFlowCtx();

    await handleNewExamPage(ctx, botSessions, port, CHAT_ID, 'next', NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'pick', itemIds: [], page: 1 },
      NOW,
    );
  });

  it('шаг уже не «pick» — игнорируется', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'title' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamPage(ctx, botSessions, fakeExamBotPort(), CHAT_ID, 'next', NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });
});

describe('handleNewExamAssemble — защита от «Собрать» без отметок', () => {
  it('itemIds пуст (устаревшая кнопка) — игнорируется', async () => {
    const session: BotSessionLean = {
      kind: 'examBuildDraft',
      buildStep: 'pick',
      buildItemIds: [],
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamAssemble(ctx, botSessions, CHAT_ID, NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });
});

describe('handleNewExamTimeLimit — защита от устаревшей кнопки', () => {
  it('шаг уже не «timeLimit» — игнорируется', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'attempts' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamTimeLimit(ctx, botSessions, CHAT_ID, '30', NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('«none» — переходит дальше без timeLimitMin в патче', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'timeLimit' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx } = fakeFlowCtx();

    await handleNewExamTimeLimit(ctx, botSessions, CHAT_ID, 'none', NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'attempts' },
      NOW,
    );
  });

  it('«30» — переходит дальше с timeLimitMin: 30 в патче', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'timeLimit' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx } = fakeFlowCtx();

    await handleNewExamTimeLimit(ctx, botSessions, CHAT_ID, '30', NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'attempts', timeLimitMin: 30 },
      NOW,
    );
  });
});

describe('handleNewExamAttempts — защита от устаревшей кнопки', () => {
  it('шаг уже не «attempts» — игнорируется', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'confirm' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamAttempts(ctx, botSessions, CHAT_ID, '2', NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('TTL истёк между записью и перечитыванием — не рисует экран поверх пропавшего черновика', async () => {
    const session: BotSessionLean = { kind: 'examBuildDraft', buildStep: 'attempts' };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(null),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamAttempts(ctx, botSessions, CHAT_ID, '2', NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalled();
    expect(edits).toEqual([]);
  });
});

describe('handleNewExamCancel', () => {
  it('чистит сессию и отвечает про отменённый черновик', async () => {
    const botSessions = fakeBotSessionService();
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamCancel(ctx, botSessions, CHAT_ID);

    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
    expect(edits[0]).toContain('отменён');
  });
});
