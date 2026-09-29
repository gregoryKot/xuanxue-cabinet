// Query GET /deliveries — «последние проблемы» (docs/PLAN.md §6 «Рассылки»):
// без окна дат, только текущий статус и лимит (образец — ListLessonsDto).
import { IsIn, IsOptional } from 'class-validator';
import {
  DELIVERY_STATUSES,
  type ApiRouteQuery,
  type DeliveryStatus,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListDeliveriesDto implements ApiRouteQuery<'GET /deliveries'> {
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: DeliveryStatus;

  @ListLimit()
  limit?: number;
}
