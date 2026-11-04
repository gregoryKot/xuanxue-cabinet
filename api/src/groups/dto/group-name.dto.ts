// Тело POST и PATCH /groups — одно поле, одна форма.
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { GROUP_LIMITS, type ApiRouteBody } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class GroupNameDto
  implements ApiRouteBody<'POST /groups'>, ApiRouteBody<'PATCH /groups/:id'>
{
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(GROUP_LIMITS.name)
  name!: string;
}
