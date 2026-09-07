// GET /summary — числа для админа/учителя (docs/PLAN.md §6, CLAUDE.md
// «Продуктовая фича = число в „Сводке“»). Доступ по роли, не по владельцу
// (данные школы, ADR-0010).
import { Controller, Get } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { SummaryDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { SummaryService } from './summary.service';

@Controller('summary')
@Roles('teacher', 'admin')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get()
  get(): Promise<SummaryDto> {
    return this.summaryService.get(DateTime.utc());
  }
}
