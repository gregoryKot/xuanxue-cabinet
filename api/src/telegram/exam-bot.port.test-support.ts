// Фейковый ExamBotPort для спеков хендлеров бота (exam-attempt-*.spec.ts,
// exam-callback-router.spec.ts, exam-command.handler.spec.ts) — тот же
// приём, что FakeExamNotifier (exams/exam-notifier.test-support.ts):
// свойства объявлены типом `jest.Mock`, не методом интерфейса, иначе
// `@typescript-eslint/unbound-method` ругается на `expect(port.x).toHaveBeenCalledWith(...)`.
import type { DateTime } from 'luxon';
import type { AttemptAnswerDto, ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import type { ExamBotPort } from './exam-bot.port';

export interface FakeExamBotPort extends ExamBotPort {
  listMyExams: jest.Mock<Promise<MyExamDto[]>, [UserLean, DateTime]>;
  startAttempt: jest.Mock<Promise<ExamAttemptDto>, [string, UserLean, DateTime]>;
  loadOwnAttempt: jest.Mock<Promise<ExamAttemptDto | null>, [string, UserLean, DateTime]>;
  saveAnswer: jest.Mock<
    Promise<ExamAttemptDto>,
    [string, UserLean, AttemptAnswerDto, DateTime]
  >;
  submitAttempt: jest.Mock<Promise<ExamAttemptDto>, [string, UserLean, DateTime]>;
}

export function fakeExamBotPort(
  overrides: Partial<FakeExamBotPort> = {},
): FakeExamBotPort {
  return {
    listMyExams: jest
      .fn<Promise<MyExamDto[]>, [UserLean, DateTime]>()
      .mockResolvedValue([]),
    startAttempt: jest.fn<Promise<ExamAttemptDto>, [string, UserLean, DateTime]>(),
    loadOwnAttempt: jest
      .fn<Promise<ExamAttemptDto | null>, [string, UserLean, DateTime]>()
      .mockResolvedValue(null),
    saveAnswer: jest.fn<
      Promise<ExamAttemptDto>,
      [string, UserLean, AttemptAnswerDto, DateTime]
    >(),
    submitAttempt: jest.fn<Promise<ExamAttemptDto>, [string, UserLean, DateTime]>(),
    ...overrides,
  };
}
