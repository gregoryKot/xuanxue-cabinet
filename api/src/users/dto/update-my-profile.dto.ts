// Тело PATCH /me/profile — человек называет себя сам на первом входе
// (ADR-0044, экран `/welcome`, shared/src/person-name.ts). firstName
// обязателен и не может быть пустым. lastName — как location в
// CreateClassDto: OptionalNotNull, пустая строка допустима — человек стирает
// фамилию, joinPersonName отбрасывает её из склеенного имени вместе с
// пробелом-разделителем.
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PERSON_NAME_PART_MAX, type ApiRouteBody } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateMyProfileDto implements ApiRouteBody<'PATCH /me/profile'> {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PERSON_NAME_PART_MAX)
  firstName!: string;

  @OptionalNotNull()
  @TrimString()
  @IsString()
  @MaxLength(PERSON_NAME_PART_MAX)
  lastName?: string;
}
