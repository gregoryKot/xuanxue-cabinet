// GET/POST /broadcasts, GET /broadcasts/:id, GET /broadcasts/:id/deliveries,
// POST /broadcasts/:id/cancel — журнал и разовая рассылка (docs/PLAN.md §6
// «Рассылки»), доступ только учителю/админу (данные школы, ADR-0010).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { BroadcastDto, DeliveryDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListBroadcastsDto } from './dto/list-broadcasts.dto';

@Controller('broadcasts')
@Roles('teacher', 'admin')
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Get()
  list(@Query() query: ListBroadcastsDto): Promise<BroadcastDto[]> {
    return this.broadcastsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<BroadcastDto> {
    return this.broadcastsService.getById(id);
  }

  @Get(':id/deliveries')
  listDeliveries(@Param('id') id: string): Promise<DeliveryDto[]> {
    return this.broadcastsService.listDeliveries(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateBroadcastDto,
    @CurrentUser() user: UserLean,
  ): Promise<BroadcastDto> {
    return this.broadcastsService.createManual(body, user.id, DateTime.utc());
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string): Promise<BroadcastDto> {
    return this.broadcastsService.cancel(id);
  }
}
