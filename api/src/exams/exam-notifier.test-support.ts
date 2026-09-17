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
  ExamNotifyResult,
} from './exam-notifier';

export interface FakeExamNotifier extends ExamNotifier {
  notifyAttemptSubmitted: jest.Mock<
    Promise<ExamNotifyResult>,
    [AttemptSubmittedContext, DateTime]
  >;
  notifyExamGraded: jest.Mock<Promise<ExamNotifyResult>, [ExamGradedContext, DateTime]>;
}

export function fakeExamNotifier(): FakeExamNotifier {
  return {
    // Фейк ничего не шлёт — счётчик нулевой; тестам сервисов важен сам факт
    // вызова notifier с нужным context, не число адресатов.
    notifyAttemptSubmitted: jest
      .fn<Promise<ExamNotifyResult>, [AttemptSubmittedContext, DateTime]>()
      .mockResolvedValue({ recipients: 0 }),
    notifyExamGraded: jest
      .fn<Promise<ExamNotifyResult>, [ExamGradedContext, DateTime]>()
      .mockResolvedValue({ recipients: 0 }),
  };
}
