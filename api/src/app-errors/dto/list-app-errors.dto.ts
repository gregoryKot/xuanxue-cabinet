// Query GET /dev/errors — экран «Сбои» (ADR-0132), доступен только роли
// `admin`. Образец — ListDeliveriesDto.
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  APP_ERROR_KINDS,
  APP_ERROR_LIMITS,
  APP_ERROR_SOURCES,
  type AppErrorKind,
  type ApiRouteQuery,
  type AppErrorSource,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListAppErrorsQueryDto implements ApiRouteQuery<'GET /dev/errors'> {
  @IsOptional()
  @IsString()
  @MaxLength(APP_ERROR_LIMITS.requestId)
  requestId?: string;

  @IsOptional()
  @IsIn(APP_ERROR_SOURCES)
  source?: AppErrorSource;

  @IsOptional()
  @IsIn(APP_ERROR_KINDS)
  kind?: AppErrorKind;

  @ListLimit(APP_ERROR_LIMITS.maxLimit)
  limit?: number;
}
