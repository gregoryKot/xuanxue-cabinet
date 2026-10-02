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
// Два корня маршрутов (`exams/:examId/attempts`, `attempts/...`) —
// `@Controller()` без префикса, полный путь у каждого хендлера:
// `ExamsController` уже занял `exams`, свой `@Controller` с тем же
// префиксом ради одного вложенного POST избыточен (CLAUDE.md «Файлы»).
// Ответы хендлеров — по карте маршрутов (`@ApiRoute`, ADR-0148).
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
} from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
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
import { STAFF_ONLY_ROLES } from './exam-staff-roles';
import { ListAttemptsDto } from './dto/list-attempts.dto';
import { PutGradingDto } from './dto/put-grading.dto';
import { SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';

@Controller()
export class ExamAttemptsController {
  constructor(
    private readonly examAttemptsService: ExamAttemptsService,
    private readonly examGradingsService: ExamGradingsService,
    private readonly mediaAssetsService: MediaAssetsService,
    private readonly examAttemptCountService: ExamAttemptCountService,
  ) {}

  // Старт идемпотентен (ТЗ 4.4, п.3): и первый, и повторный вызов отдают
  // попытку с 201, как обычное POST-создание — разбирать ради статуса не стоит.
  @Post('exams/:examId/attempts')
  @ApiRoute('POST /exams/:examId/attempts')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @Param('examId') examId: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.start(examId, user.id, DateTime.utc());
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  // Редактору формы — сколько попыток затронет правка вопроса: попытка живёт
  // снимком на момент старта (ADR-0022). Штат школы, ученику не нужно.
  @Get('exams/:examId/attempt-count')
  @ApiRoute('GET /exams/:examId/attempt-count')
  @Roles(...STAFF_ONLY_ROLES)
  countByExam(@Param('examId') examId: string): Promise<ExamAttemptCountDto> {
    return this.examAttemptCountService.countByExam(examId);
  }

  @Patch('attempts/:id/answers')
  @ApiRoute('PATCH /attempts/:id/answers')
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
  @ApiRoute('POST /attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.submit(id, user.id, DateTime.utc());
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  @Get('attempts')
  @ApiRoute('GET /attempts')
  async list(
    @Query() query: ListAttemptsDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto[]> {
    const attempts = await this.examAttemptsService.list(query, user, DateTime.utc());
    return withAttemptsMedia(this.mediaAssetsService, attempts);
  }

  // Своя попытка своим адресом, не весь список (ADR-0126). Без @Roles:
  // владение по сессии (шапка файла).
  @Get('attempts/:id')
  @ApiRoute('GET /attempts/:id')
  async getOwn(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.examAttemptsService.getOwn(id, user.id, DateTime.utc());
    return withAttemptMedia(this.mediaAssetsService, attempt);
  }

  // Слой 4.6: карточка проверки и оценка — закрыты ученику: на классе ролей
  // нет, @Roles стоит на самих хендлерах.
  @Get('attempts/:id/review')
  @ApiRoute('GET /attempts/:id/review')
  @Roles(...STAFF_ONLY_ROLES)
  async review(@Param('id') id: string): Promise<AttemptReviewDto> {
    const review = await this.examGradingsService.getReview(id, DateTime.utc());
    return withReviewMedia(this.mediaAssetsService, review);
  }

  // Карточка целиком (AttemptReviewDto), не голая оценка: экран проверки
  // кладёт ответ на себя без второго GET (ADR-0087, #345). Возврат
  // ExamGradingsService.grade() трогать нельзя — он нужен боту
  // (ExamBotPort.gradeAttempt).
  @Put('attempts/:id/grading')
  @ApiRoute('PUT /attempts/:id/grading')
  @Roles(...STAFF_ONLY_ROLES)
  async grade(
    @Param('id') id: string,
    @Body() body: PutGradingDto,
    @CurrentUser() user: UserLean,
  ): Promise<AttemptReviewDto> {
    await this.examGradingsService.grade(id, user.id, body, DateTime.utc());
    const review = await this.examGradingsService.getReview(id, DateTime.utc());
    return withReviewMedia(this.mediaAssetsService, review);
  }
}
