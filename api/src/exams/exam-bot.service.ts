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
import type { DateTime } from 'luxon';
import {
  LIST_LIMIT_MAX,
  type AttemptAnswerDto,
  type ExamAttemptDto,
  type MyExamDto,
} from '@xuanxue/shared';
import { MediaAssetsService } from '../media/media-assets.service';
import { withAttemptMedia } from './exam-attempt-media';
import { ExamBotPortRegistry } from '../telegram/exam-bot-port.registry';
import type { ExamBotPort } from '../telegram/exam-bot.port';
import type { UserLean } from '../users/users.service';
import { ExamAttemptsService } from './exam-attempts.service';
import { MyExamsService } from './my-exams.service';

@Injectable()
export class ExamBotService implements ExamBotPort {
  constructor(
    private readonly myExamsService: MyExamsService,
    private readonly examAttemptsService: ExamAttemptsService,
    private readonly mediaAssetsService: MediaAssetsService,
    registry: ExamBotPortRegistry,
  ) {
    registry.set(this);
  }

  listMyExams(user: UserLean, now: DateTime): Promise<MyExamDto[]> {
    return this.myExamsService.list({}, user.id, now);
  }

  async startAttempt(
    examId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.start(examId, user.id, now);
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  /** `GET /attempts/:id` у сервиса нет — тот же приём, что у веб-кабинета
   * (web/src/attempt/useAttempt.ts): берём список СВОИХ попыток и находим
   * нужную. `roles: []` — попытка «своя», даже если её открывает учитель или
   * админ (ТЗ 4.4: штат проходит форму теми же маршрутами, что ученик) — а
   * список просим не «как штат», иначе он отдал бы ВСЕ попытки школы, и
   * чужой attemptId в callback data (кто угодно мог подделать кнопку) утёк
   * бы штатному сотруднику вместо честного «попытка не найдена». */
  async loadOwnAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto | null> {
    const attempts = await this.examAttemptsService.list(
      { limit: LIST_LIMIT_MAX },
      { ...user, roles: [] },
      now,
    );
    const attempt = attempts.find((a) => a.id === attemptId);
    return attempt ? withAttemptMedia(this.mediaAssetsService, attempt) : null;
  }

  async saveAnswer(
    attemptId: string,
    user: UserLean,
    answer: AttemptAnswerDto,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.saveAnswers(
      attemptId,
      user.id,
      { answers: [answer] },
      now,
    );
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  async submitAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.submit(attemptId, user.id, now);
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }
}
