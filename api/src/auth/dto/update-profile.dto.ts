// Тело `PATCH /me/profile`. `userId` в теле нет и не будет: владелец —
// сессия (@CurrentUser в контроллере), не поле формы — иначе один человек
// мог бы переименовать другого. Глобальный ValidationPipe — не только
// `whitelist: true`, но и `forbidNonWhitelisted: true` (app.setup.ts):
// поле, которого нет в этом DTO, не «молча отбрасывается», а роняет весь
// запрос 400-м — чужой id тем более не пройдёт частично.
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  PROFILE_LIMITS,
  PROFILE_NAME_REQUIRED_MESSAGE,
  type UpdateProfileInput,
} from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class UpdateProfileDto implements UpdateProfileInput {
  @TrimString()
  @IsString()
  @IsNotEmpty({ message: PROFILE_NAME_REQUIRED_MESSAGE })
  @MaxLength(PROFILE_LIMITS.nameMax)
  name!: string;
}
