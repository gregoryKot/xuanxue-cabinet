// Реализация ExamBotPort (api/src/telegram/exam-bot.port.ts): бот — второй
// клиент ExamAttemptsService/MyExamsService (ADR-0024, PLAN.md §12 слой
// 4б.2). Кладёт себя в ExamBotPortRegistry — провайдер на стороне telegram/,
// потому что импортировать exams/ оттуда нельзя (ExamsModule уже импортирует
// TelegramModule ради EXAM_NOTIFIER, обратный импорт закольцевал бы граф).
// Регистрация в конструкторе: провайдеры всех модулей строятся раньше, чем
// бот получит первый апдейт.
//
// `.media` подмешиваем тем же приёмом, что ExamAttemptsController
// (exam-attempt-media.ts) — экрану вопроса-видео бота (ТЗ 4б.2 часть 2,
// exam-question-screen.ts) нужно знать, привязано ли уже видео, а сервис
// попыток сам этого не знает (media_assets — коллекция MediaModule).
import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  LIST_LIMIT_MAX,
  type AttemptAnswerDto,
  type AttemptReviewDto,
  type CreateExamInput,
  type CreateExamItemInput,
  type ExamAttemptDto,
  type ExamGradingDto,
  type ExamItemDto,
  type MyExamDto,
  type PutGradingInput,
} from '@xuanxue/shared';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { ExamVideosService } from '../exam-videos/exam-videos.service';
import { MediaAssetsService } from '../media/media-assets.service';
import { withAttemptMedia, withReviewMedia } from './exam-attempt-media';
import type { AttemptAnswersChange } from './exam-attempt-save';
import type { ToggleOptionInput } from './exam-attempt-toggle-option';
import { degradeNotFound } from './exam-bot-degrade';
import { loadOptionImageForBot, loadOptionVideoForBot } from './exam-bot-media';
import { validateExamDraftInput } from './exam-draft-validate';
import { validateExamItemDraftInput } from './exam-item-draft-validate';
import { ExamBotPortRegistry } from '../telegram/exam-bot-port.registry';
import type {
  BotOptionImage,
  BotOptionVideo,
  ExamBotPort,
} from '../telegram/exam-bot.port';
import type { UserLean } from '../users/users.service';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamGradingsService } from './exam-gradings.service';
import { ExamItemsService } from './exam-items.service';
import { ExamsService } from './exams.service';
import { MyExamsService } from './my-exams.service';

@Injectable()
export class ExamBotService implements ExamBotPort {
  constructor(
    private readonly myExamsService: MyExamsService,
    private readonly examAttemptsService: ExamAttemptsService,
    private readonly examGradingsService: ExamGradingsService,
    private readonly mediaAssetsService: MediaAssetsService,
    private readonly examImagesService: ExamImagesService,
    private readonly examVideosService: ExamVideosService,
    private readonly examItemsService: ExamItemsService,
    private readonly examsService: ExamsService,
    registry: ExamBotPortRegistry,
  ) {
    registry.set(this);
  }

  listMyExams(user: UserLean, now: DateTime): Promise<MyExamDto[]> {
    return this.myExamsService.list({}, user.id, now);
  }

  // `.media` — шапка файла; один помощник на все пути, что отдают попытку.
  private readonly withMedia = (attempt: Promise<ExamAttemptDto>) =>
    attempt.then((dto) => withAttemptMedia(this.mediaAssetsService, dto));

  startAttempt = (examId: string, user: UserLean, now: DateTime) =>
    this.withMedia(this.examAttemptsService.start(examId, user.id, now));

  /** Тот же getOwn, что `GET /attempts/:id` (ADR-0126): владение в фильтре
   * findOne (SECURITY §3), не список из 200 с поиском на клиенте (аудит
   * 2026-10-01, F26); NotFoundError чужого/битого id — `null`. Отличие от списка:
   * попытки мягко удалённых форм (ADR-0140) не вычитаются — как на экране сдачи. */
  loadOwnAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto | null> {
    return degradeNotFound(() =>
      this.withMedia(this.examAttemptsService.getOwn(attemptId, user.id, now)),
    );
  }

  private applyAnswers(
    attemptId: string,
    user: UserLean,
    change: AttemptAnswersChange,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    return this.withMedia(
      this.examAttemptsService.saveAnswers(attemptId, user.id, change, now),
    );
  }

  saveAnswer = (
    attemptId: string,
    user: UserLean,
    answer: AttemptAnswerDto,
    now: DateTime,
  ) => this.applyAnswers(attemptId, user, { answers: [answer] }, now);

  // Переключение считает сервер внутри CAS (F27, exam-attempt-toggle-option.ts).
  toggleOption = (
    attemptId: string,
    user: UserLean,
    input: ToggleOptionInput,
    now: DateTime,
  ) => this.applyAnswers(attemptId, user, { toggleOption: input }, now);

  submitAttempt = (attemptId: string, user: UserLean, now: DateTime) =>
    this.withMedia(this.examAttemptsService.submit(attemptId, user.id, now));

  // NotFoundError → `null`: логика в exam-bot-media.ts (файл-лимит, комментарий там же).
  loadOptionImage = (imageId: string, user: UserLean): Promise<BotOptionImage | null> =>
    loadOptionImageForBot(this.examImagesService, imageId, user);

  rememberTelegramFileId = (imageId: string, fileId: string): Promise<void> =>
    this.examImagesService.rememberTelegramFileId(imageId, fileId);

  // NotFoundError/NotAvailableError → `null`: exam-bot-media.ts (ADR-0133, файл-лимит).
  loadOptionVideo = (
    videoId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<BotOptionVideo | null> =>
    loadOptionVideoForBot(this.examVideosService, videoId, user, now);

  rememberVideoFileId = (videoId: string, fileId: string): Promise<void> =>
    this.examVideosService.rememberTelegramFileId(videoId, fileId);

  /** ТЗ 4б.3 — тот же сервис, что и POST /exam-items кабинета, валидация
   * (формулировка, варианты, верный ответ) целиком в нём. */
  createExamItem(input: CreateExamItemInput, authorId: string): Promise<ExamItemDto> {
    return this.examItemsService.create(input, authorId);
  }

  validateExamItemDraft(input: Partial<CreateExamItemInput>): Promise<string[] | null> {
    return validateExamItemDraftInput(input);
  }

  /** ТЗ 4б.4 — только опубликованные (тот же фильтр, что assertItemsEligible
   * проверяет при публикации): вопрос, который нельзя поставить в форму,
   * незачем видеть на шаге отметки. */
  listExamItemsToAssemble(): Promise<ExamItemDto[]> {
    return this.examItemsService.list({ status: 'published', limit: LIST_LIMIT_MAX });
  }

  /** ТЗ 4б.4 — тот же переход в `published`, что и у кабинета, одним
   * вызовом (ExamsService.createAndPublishExam); `now` — момент апдейта бота. */
  createAndPublishExam: ExamBotPort['createAndPublishExam'] = (input, authorId, now) =>
    this.examsService.createAndPublishExam(input, authorId, now);

  validateExamDraft(input: Partial<CreateExamInput>): Promise<string[] | null> {
    return validateExamDraftInput(input);
  }

  // NotFoundError → `null` через degradeNotFound (exam-bot-degrade.ts, файл-лимит);
  // проверяющий уже штат, дальше решать вызывающему хендлеру, что сказать.
  loadAttemptReview(attemptId: string): Promise<AttemptReviewDto | null> {
    return degradeNotFound(async () => {
      const review = await this.examGradingsService.getReview(attemptId, DateTime.utc());
      return withReviewMedia(this.mediaAssetsService, review);
    });
  }

  gradeAttempt = (
    attemptId: string,
    graderId: string,
    input: PutGradingInput,
    now: DateTime,
  ): Promise<ExamGradingDto | null> =>
    degradeNotFound(() =>
      this.examGradingsService.grade(attemptId, graderId, input, now),
    );

  listSubmittedAttempts(user: UserLean, now: DateTime): Promise<ExamAttemptDto[]> {
    return this.examAttemptsService.list({ status: 'submitted' }, user, now);
  }
}
