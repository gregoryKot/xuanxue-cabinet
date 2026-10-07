// GET /me/events — предстоящие события школы на доске (ADR-0177). Данные
// школы, не ученика: владельца нет, нужна только сессия — доступно любой
// роли, включая ученика без единой роли (образец — board.controller.ts).
import { Controller, Get } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { SchoolEventDto } from '@xuanxue/shared';
import { ApiRoute } from '../common/api-route.decorator';
import { SchoolEventsService } from './school-events.service';

@Controller('me/events')
export class MySchoolEventsController {
  constructor(private readonly schoolEventsService: SchoolEventsService) {}

  @Get()
  @ApiRoute('GET /me/events')
  list(): Promise<SchoolEventDto[]> {
    return this.schoolEventsService.listUpcoming(DateTime.utc());
  }
}
