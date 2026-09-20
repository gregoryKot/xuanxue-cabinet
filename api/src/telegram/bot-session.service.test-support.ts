// Фейковый BotSessionService для спеков хендлеров бота — тот же приём, что
// exam-bot.port.test-support.ts (jest.Mock как тип поля, не метод: иначе
// `@typescript-eslint/unbound-method` ругается на
// `expect(x).toHaveBeenCalledWith(...)`), общий, чтобы не заводить фейк в
// каждом спеке заново (CLAUDE.md «Одна механика — один компонент»).
import type { DateTime } from 'luxon';
import type { ExamItemKind } from '@xuanxue/shared';
import type { BotSessionLean } from './bot-session.lean';
import type { BotSessionService } from './bot-session.service';
import type { NewExamDraftPatch } from './new-exam-draft-wait';
import type { NewExamItemDraftPatch } from './new-exam-item-draft-wait';

export interface FakeBotSessionService extends BotSessionService {
  startExamMediaWait: jest.Mock<
    Promise<void>,
    [number, string, DateTime, number?, string?]
  >;
  startExamTextWait: jest.Mock<Promise<void>, [number, string, number, DateTime]>;
  startPaymentWait: jest.Mock<Promise<void>, [number, string, DateTime]>;
  clear: jest.Mock<Promise<void>, [number]>;
  get: jest.Mock<Promise<BotSessionLean | null>, [number, DateTime]>;
  startNewExamItemDraft: jest.Mock<Promise<void>, [number, ExamItemKind, DateTime]>;
  setNewExamItemDraft: jest.Mock<
    Promise<void>,
    [number, NewExamItemDraftPatch, DateTime]
  >;
  startNewExamDraft: jest.Mock<Promise<void>, [number, DateTime]>;
  setNewExamDraft: jest.Mock<Promise<void>, [number, NewExamDraftPatch, DateTime]>;
}

export function fakeBotSessionService(
  overrides: Partial<FakeBotSessionService> = {},
): FakeBotSessionService {
  return {
    startTopicWait: jest.fn(),
    startRecordingWait: jest.fn(),
    startExamMediaWait: jest.fn().mockResolvedValue(undefined),
    startExamTextWait: jest.fn().mockResolvedValue(undefined),
    startPaymentWait: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    clearIfLesson: jest.fn(),
    hasExpired: jest.fn(),
    startNewExamItemDraft: jest.fn().mockResolvedValue(undefined),
    setNewExamItemDraft: jest.fn().mockResolvedValue(undefined),
    startNewExamDraft: jest.fn().mockResolvedValue(undefined),
    setNewExamDraft: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FakeBotSessionService;
}
