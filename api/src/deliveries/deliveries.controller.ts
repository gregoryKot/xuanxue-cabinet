// GET /deliveries/:id, POST /deliveries/:id/mark-sent — доступ только
// учителю/админу (данные школы, ADR-0010).
import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { DeliveryDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { DeliveriesService } from './deliveries.service';

@Controller('deliveries')
@Roles('teacher', 'admin')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

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
