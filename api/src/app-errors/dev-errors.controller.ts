// GET /dev/errors — экран «Сбои» (ADR-0132): текст ошибок «Сбой в браузере»/
// «Сбой в кабинете» (ADR-0071/ADR-0053), которые раньше были видны только в
// логах Railway. Только `admin` (в интерфейсе роль подписана «Разработчик») —
// данные школы по роли (ADR-0010), не персональные данные ученика.
import { Controller, Get, Query } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { AppErrorListDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { AppErrorsService } from './app-errors.service';
import { ListAppErrorsQueryDto } from './dto/list-app-errors.dto';

@Controller('dev/errors')
@Roles('admin')
export class DevErrorsController {
  constructor(private readonly appErrorsService: AppErrorsService) {}

  @Get()
  @ApiRoute('GET /dev/errors')
  async list(@Query() query: ListAppErrorsQueryDto): Promise<AppErrorListDto> {
    return this.appErrorsService.list(query, DateTime.utc());
  }
}
