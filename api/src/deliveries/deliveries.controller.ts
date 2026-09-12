// GET /deliveries, GET /deliveries/:id, POST /deliveries/:id/mark-sent —
// доступ учителю, помощнику учителя и админу (данные школы, ADR-0010).
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { DeliveryDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { DeliveriesService } from './deliveries.service';
import { ListDeliveriesDto } from './dto/list-deliveries.dto';

@Controller('deliveries')
@Roles('teacher', 'assistant', 'admin')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  list(@Query() query: ListDeliveriesDto): Promise<DeliveryDto[]> {
    return this.deliveriesService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DeliveryDto> {
    return this.deliveriesService.getById(id);
  }

  @Post(':id/mark-sent')
  @HttpCode(HttpStatus.OK)
  markSent(@Param('id') id: string): Promise<DeliveryDto> {
    return this.deliveriesService.markSent(id, DateTime.utc());
  }
}
