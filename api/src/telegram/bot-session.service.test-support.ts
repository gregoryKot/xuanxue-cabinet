// Фейковый BotSessionService для спеков хендлеров бота — тот же приём, что
// exam-bot.port.test-support.ts (jest.Mock как тип поля, не метод: иначе
// `@typescript-eslint/unbound-method` ругается на
// `expect(x).toHaveBeenCalledWith(...)`), общий, чтобы не заводить фейк в
// каждом спеке заново (CLAUDE.md «Одна механика — один компонент»).
import type { DateTime } from 'luxon';
import type { BotSessionLean, BotSessionService } from './bot-session.service';

export interface FakeBotSessionService extends BotSessionService {
  startExamMediaWait: jest.Mock<Promise<void>, [number, string, DateTime, number?]>;
  startExamTextWait: jest.Mock<Promise<void>, [number, string, number, DateTime]>;
  clear: jest.Mock<Promise<void>, [number]>;
  get: jest.Mock<Promise<BotSessionLean | null>, [number, DateTime]>;
}

export function fakeBotSessionService(
  overrides: Partial<FakeBotSessionService> = {},
): FakeBotSessionService {
  return {
    startTopicWait: jest.fn(),
    startRecordingWait: jest.fn(),
    startExamMediaWait: jest.fn().mockResolvedValue(undefined),
    startExamTextWait: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    clearIfLesson: jest.fn(),
    hasExpired: jest.fn(),
    ...overrides,
  } as unknown as FakeBotSessionService;
}
