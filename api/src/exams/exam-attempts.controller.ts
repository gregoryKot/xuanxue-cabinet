// Попытка сдачи экзамена — данные ученика (ADR-0010): владение по `userId` из
// сессии, не по роли. Роли на классе нет вовсе (ADR-0026): ученик — это
// подтверждённый человек без ролей учителя, и требовать от него роль значило
// бы не пускать на экзамен никого (H1 аудита 2026-09-12). Дверь сторожит
// AuthGuard: сессия есть и статус `active`. Учитель и помощник проходят
// форму теми же маршрутами — им полезно увидеть её изнутри до первого
// сдающего (ТЗ 4.4, п.1), владение всё равно по `user.id`. Список —
// исключение: `teacher`/`assistant`/`admin` видят там все попытки школы
// (ExamAttemptsService.list, роль, а не владение — ADR-0010).
// Проверка (слой 4.6, `review`/`grading` ниже) закрыта ученику ролью на
// хендлере — учитель видит чужую работу по сути своей роли, не как
// исключение из владения.
//
// Два разных корня маршрутов (`exams/:examId/attempts`, `attempts/...`) —
// `@Controller()` без общего префикса, полный путь у каждого хендлера:
// `ExamsController` уже занял `exams` под форму, заводить свой `@Controller`
// с тем же префиксом ради одного вложенного POST избыточно (CLAUDE.md
// «Файлы»), а `@Controller('attempts')` для остальных оставил бы старт не
// под ним — один файл, один сервис на попытку плюс сервис проверки
// (слой 4.6 — своя коллекция, ExamGradingsService), явные пути.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type {
  AttemptReviewDto,
  ExamAttemptCountDto,
  ExamAttemptDto,
  ExamGradingDto,
} from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { MediaAssetsService } from '../media/media-assets.service';
import type { UserLean } from '../users/users.service';
import { ExamAttemptCountService } from './exam-attempt-count.service';
import {
  withAttemptMedia,
  withAttemptsMedia,
  withReviewMedia,
} from './exam-attempt-media';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamGradingsService } from './exam-gradings.service';
import { ListAttemptsDto } from './dto/list-attempts.dto';
import { PutGradingDto } from './dto/put-grading.dto';
import { SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';

const STAFF_ONLY_ROLES = ['teacher', 'assistant', 'admin'] as const;

@Controller()
export class ExamAttemptsController {
  constructor(
    private readonly examAttemptsService: ExamAttemptsService,
    private readonly examGradingsService: ExamGradingsService,
    private readonly mediaAssetsService: MediaAssetsService,
    private readonly examAttemptCountService: ExamAttemptCountService,
  ) {}

  // Не всегда создаёт новую попытку (идемпотентный старт — ТЗ 4.4, п.3), но
  // и первый вызов, и повторный возвращают ресурс попытки — 201 как у
  // обычного POST-создания (ExamsController.create), а не 200: разбирать
  // здесь на «создал/вернул старую» ради статуса не стоит.
  @Post('exams/:examId/attempts')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @Param('examId') examId: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.start(examId, user.id, DateTime.utc());
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  // Редактору формы — сколько попыток затронет правка вопроса (ADR-0022):
  // попытка живёт снимком формы на момент старта, редактор должен видеть
  // охват до сохранения. Штат школы — как review ниже, ученику не нужно.
  @Get('exams/:examId/attempt-count')
  @Roles(...STAFF_ONLY_ROLES)
  countByExam(@Param('examId') examId: string): Promise<ExamAttemptCountDto> {
    return this.examAttemptCountService.countByExam(examId);
  }

  @Patch('attempts/:id/answers')
  async saveAnswers(
    @Param('id') id: string,
    @Body() body: SaveAttemptAnswersDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.saveAnswers(
      id,
      user.id,
      body,
      DateTime.utc(),
    );
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.submit(id, user.id, DateTime.utc());
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  @Get('attempts')
  async list(
    @Query() query: ListAttemptsDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto[]> {
    const attempts = await this.examAttemptsService.list(query, user, DateTime.utc());
    return withAttemptsMedia(this.mediaAssetsService, attempts);
  }

  // Слой 4.6: карточка проверки и оценка — закрыты ученику: на классе ролей
  // нет, @Roles стоит на самих хендлерах.
  @Get('attempts/:id/review')
  @Roles(...STAFF_ONLY_ROLES)
  async review(@Param('id') id: string): Promise<AttemptReviewDto> {
    const review = await this.examGradingsService.getReview(id);
    return withReviewMedia(this.mediaAssetsService, review);
  }

  @Put('attempts/:id/grading')
  @Roles(...STAFF_ONLY_ROLES)
  grade(
    @Param('id') id: string,
    @Body() body: PutGradingDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamGradingDto> {
    return this.examGradingsService.grade(id, user.id, body, DateTime.utc());
  }
}
