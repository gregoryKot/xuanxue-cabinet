// Query GET /deliveries — «последние проблемы» (docs/PLAN.md §6 «Рассылки»):
// без окна дат, только текущий статус и лимит (образец — ListLessonsDto).
import { IsIn, IsOptional } from 'class-validator';
import {
  DELIVERY_STATUSES,
  type DeliveryStatus,
  type ListDeliveriesQuery,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListDeliveriesDto implements ListDeliveriesQuery {
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: DeliveryStatus;

  @ListLimit()
  limit?: number;
}
