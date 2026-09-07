// POST /broadcasts, GET /broadcasts/:id — разовая рассылка (docs/PLAN.md §6
// «Рассылки»), доступ только учителю/админу (данные школы, ADR-0010). Список
// и журнал — следующий PR (там же — предпросмотр перед отправкой).
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { BroadcastDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Controller('broadcasts')
@Roles('teacher', 'admin')
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Get(':id')
  getById(@Param('id') id: string): Promise<BroadcastDto> {
    return this.broadcastsService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateBroadcastDto,
    @CurrentUser() user: UserLean,
  ): Promise<BroadcastDto> {
    return this.broadcastsService.createManual(body, user.id, DateTime.utc());
  }
}
