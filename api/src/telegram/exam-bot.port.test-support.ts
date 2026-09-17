// Фейковый ExamBotPort для спеков хендлеров бота (exam-attempt-*.spec.ts,
// exam-callback-router.spec.ts, exam-command.handler.spec.ts) — тот же
// приём, что FakeExamNotifier (exams/exam-notifier.test-support.ts):
// свойства объявлены типом `jest.Mock`, не методом интерфейса, иначе
// `@typescript-eslint/unbound-method` ругается на `expect(port.x).toHaveBeenCalledWith(...)`.
import type { DateTime } from 'luxon';
import type {
  AttemptAnswerDto,
  AttemptReviewDto,
  CreateExamInput,
  CreateExamItemInput,
  ExamAttemptDto,
  ExamDto,
  ExamGradingDto,
  ExamItemDto,
  MyExamDto,
  PutGradingInput,
} from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import type { BotOptionImage, ExamBotPort } from './exam-bot.port';

export interface FakeExamBotPort extends ExamBotPort {
  listMyExams: jest.Mock<Promise<MyExamDto[]>, [UserLean, DateTime]>;
  startAttempt: jest.Mock<Promise<ExamAttemptDto>, [string, UserLean, DateTime]>;
  loadOwnAttempt: jest.Mock<Promise<ExamAttemptDto | null>, [string, UserLean, DateTime]>;
  saveAnswer: jest.Mock<
    Promise<ExamAttemptDto>,
    [string, UserLean, AttemptAnswerDto, DateTime]
  >;
  submitAttempt: jest.Mock<Promise<ExamAttemptDto>, [string, UserLean, DateTime]>;
  loadOptionImage: jest.Mock<Promise<BotOptionImage | null>, [string, UserLean]>;
  rememberTelegramFileId: jest.Mock<Promise<void>, [string, string]>;
  createExamItem: jest.Mock<Promise<ExamItemDto>, [CreateExamItemInput, string]>;
  validateExamItemDraft: jest.Mock<
    Promise<string[] | null>,
    [Partial<CreateExamItemInput>]
  >;
  listExamItemsToAssemble: jest.Mock<Promise<ExamItemDto[]>, []>;
  createAndPublishExam: jest.Mock<Promise<ExamDto>, [CreateExamInput, string]>;
  validateExamDraft: jest.Mock<Promise<string[] | null>, [Partial<CreateExamInput>]>;
  loadAttemptReview: jest.Mock<Promise<AttemptReviewDto | null>, [string]>;
  gradeAttempt: jest.Mock<
    Promise<ExamGradingDto | null>,
    [string, string, PutGradingInput, DateTime]
  >;
  listSubmittedAttempts: jest.Mock<Promise<ExamAttemptDto[]>, [UserLean, DateTime]>;
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
    // По умолчанию картинки нет — большинство спеков хендлеров бота не про
    // ADR-0035, альбом должен молча остаться пустым (buildOptionAlbum сам не
    // зовёт порт, но фейк на всякий случай ведёт себя как «нет доступа»).
    loadOptionImage: jest
      .fn<Promise<BotOptionImage | null>, [string, UserLean]>()
      .mockResolvedValue(null),
    rememberTelegramFileId: jest
      .fn<Promise<void>, [string, string]>()
      .mockResolvedValue(undefined),
    createExamItem: jest.fn<Promise<ExamItemDto>, [CreateExamItemInput, string]>(),
    // По умолчанию черновик валиден — большинство спеков хендлеров бота не
    // про DTO-лимиты (аналог loadOptionImage: пустой умолчание, чтобы не
    // отвлекать спеки про другие сценарии).
    validateExamItemDraft: jest
      .fn<Promise<string[] | null>, [Partial<CreateExamItemInput>]>()
      .mockResolvedValue(null),
    // По умолчанию список пуст — спекам, которым нужны конкретные вопросы
    // для сборки (ТЗ 4б.4), выставляют своё значение явно.
    listExamItemsToAssemble: jest.fn<Promise<ExamItemDto[]>, []>().mockResolvedValue([]),
    createAndPublishExam: jest.fn<Promise<ExamDto>, [CreateExamInput, string]>(),
    // Черновик формы валиден по умолчанию — тем же приёмом, что validateExamItemDraft.
    validateExamDraft: jest
      .fn<Promise<string[] | null>, [Partial<CreateExamInput>]>()
      .mockResolvedValue(null),
    // По умолчанию попытка не найдена — большинство спеков грейдинга не про
    // конкретный текст карточки (аналог loadOwnAttempt: пустое умолчание).
    loadAttemptReview: jest
      .fn<Promise<AttemptReviewDto | null>, [string]>()
      .mockResolvedValue(null),
    gradeAttempt: jest.fn<
      Promise<ExamGradingDto | null>,
      [string, string, PutGradingInput, DateTime]
    >(),
    listSubmittedAttempts: jest
      .fn<Promise<ExamAttemptDto[]>, [UserLean, DateTime]>()
      .mockResolvedValue([]),
    ...overrides,
  };
}
