// Попытка сдачи экзамена — данные ученика (ADR-0010): владение по `userId` из
// сессии, не по роли. Роли `teacher`/`assistant`/`admin` допущены к тем же
// маршрутам, что и `student` (помощник учителя правами равен учителю) —
// учителю полезно пройти форму изнутри, как ученик, до того как её увидит
// первый сдающий (ТЗ 4.4, п.1); владение всё равно проверяется по `user.id`,
// отдельного пути для учителя нет. Список — исключение: там `teacher`/
// `assistant`/`admin` видят все попытки школы (ExamAttemptsService.list,
// роль, не владение — ADR-0010), гость (`roles: []`) не видит ничего.
// Проверка (слой 4.6, `review`/`grading` ниже) — та же схема: роль на
// хендлере переопределяет класс (`getAllAndOverride`, AuthGuard) и закрывает
// маршрут ученику вовсе — учитель видит чужую работу по сути своей роли, не
// как исключение из владения.
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
import type { AttemptReviewDto, ExamAttemptDto, ExamGradingDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamGradingsService } from './exam-gradings.service';
import { ListAttemptsDto } from './dto/list-attempts.dto';
import { PutGradingDto } from './dto/put-grading.dto';
import { SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';

const STAFF_ONLY_ROLES = ['teacher', 'assistant', 'admin'] as const;

@Controller()
@Roles('student', 'teacher', 'assistant', 'admin')
export class ExamAttemptsController {
  constructor(
    private readonly examAttemptsService: ExamAttemptsService,
    private readonly examGradingsService: ExamGradingsService,
  ) {}

  // Не всегда создаёт новую попытку (идемпотентный старт — ТЗ 4.4, п.3), но
  // и первый вызов, и повторный возвращают ресурс попытки — 201 как у
  // обычного POST-создания (ExamsController.create), а не 200: разбирать
  // здесь на «создал/вернул старую» ради статуса не стоит.
  @Post('exams/:examId/attempts')
  @HttpCode(HttpStatus.CREATED)
  start(
    @Param('examId') examId: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    return this.examAttemptsService.start(examId, user.id, DateTime.utc());
  }

  @Patch('attempts/:id/answers')
  saveAnswers(
    @Param('id') id: string,
    @Body() body: SaveAttemptAnswersDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    return this.examAttemptsService.saveAnswers(id, user.id, body, DateTime.utc());
  }

  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto> {
    return this.examAttemptsService.submit(id, user.id, DateTime.utc());
  }

  @Get('attempts')
  list(
    @Query() query: ListAttemptsDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamAttemptDto[]> {
    return this.examAttemptsService.list(query, user, DateTime.utc());
  }

  // Слой 4.6: карточка проверки и оценка — закрыты ученику, роль на хендлере
  // переопределяет класс (@Roles('student', ...) выше), AuthGuard читает
  // ближайшую метаданную (getAllAndOverride, auth.guard.ts).
  @Get('attempts/:id/review')
  @Roles(...STAFF_ONLY_ROLES)
  review(@Param('id') id: string): Promise<AttemptReviewDto> {
    return this.examGradingsService.getReview(id);
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
