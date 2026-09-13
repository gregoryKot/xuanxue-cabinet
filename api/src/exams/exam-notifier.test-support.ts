// Фейк ExamNotifier для юнит/интеграционных тестов сервисов экзамена (слой
// 4.7, PLAN §11) — сам факт и содержимое отправки здесь не нужны (это дело
// telegram-exam-notifier.spec.ts и message-модулей), важно только «сервис
// позвал notifier с таким context и не упал» (CLAUDE.md «Тесты»: сервис
// тестируем без Telegraf/бота).
import type { DateTime } from 'luxon';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
} from './exam-notifier';

export interface FakeExamNotifier extends ExamNotifier {
  notifyAttemptSubmitted: jest.Mock<Promise<void>, [AttemptSubmittedContext, DateTime]>;
  notifyExamGraded: jest.Mock<Promise<void>, [ExamGradedContext, DateTime]>;
}

export function fakeExamNotifier(): FakeExamNotifier {
  return {
    notifyAttemptSubmitted: jest
      .fn<Promise<void>, [AttemptSubmittedContext, DateTime]>()
      .mockResolvedValue(undefined),
    notifyExamGraded: jest
      .fn<Promise<void>, [ExamGradedContext, DateTime]>()
      .mockResolvedValue(undefined),
  };
}
