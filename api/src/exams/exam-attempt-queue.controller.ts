// Очередь проверки — строки без снимка формы (`GET /attempts/queue`, аудит
// 2026-10-01 F33, ADR-0126 «Последствия»). Данные школы, по роли (ADR-0010):
// ученику — 403, он свою попытку читает по `GET /attempts/:id`. Свой
// контроллер, а не хендлер ExamAttemptsController: тот стоит на файловом
// лимите (CLAUDE.md «Храповики»). В exams.module.ts он объявлен ПЕРЕД
// ExamAttemptsController: Nest регистрирует маршруты в порядке контроллеров,
// и `attempts/:id` того контроллера иначе перехватил бы `attempts/queue`
// как id — e2e exam-attempt-queue.e2e-spec.ts ловит перестановку (ответ
// был бы 404 «попытка не найдена», не список).
import { Controller, Get, Query } from '@nestjs/common';
import type { ExamAttemptQueueItemDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { ListAttemptsDto } from './dto/list-attempts.dto';
import { ExamAttemptQueueService } from './exam-attempt-queue.service';
import { STAFF_ONLY_ROLES } from './exam-staff-roles';

@Controller()
export class ExamAttemptQueueController {
  constructor(private readonly queueService: ExamAttemptQueueService) {}

  // Query — тот же ListAttemptsDto, что у `GET /attempts`: фильтры и лимит
  // совпадают буквально, второй класс с теми же декораторами был бы дублем.
  @Get('attempts/queue')
  @ApiRoute('GET /attempts/queue')
  @Roles(...STAFF_ONLY_ROLES)
  list(@Query() query: ListAttemptsDto): Promise<ExamAttemptQueueItemDto[]> {
    return this.queueService.list(query);
  }
}
