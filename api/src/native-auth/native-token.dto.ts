import { IsNotEmpty, IsString } from 'class-validator';
import type { NativeTokenInput } from '@xuanxue/shared';

// Поля формы обмена кода (профиль Workshop 3c98d4a, «Code exchange»). Повтор
// имени в форме приходит массивом и не проходит @IsString, неизвестное поле
// роняет forbidNonWhitelisted — оба случая фильтр превращает в invalid_request.
// Значения сверяет сервис: тип гранта, клиент и формат дают свои коды ошибок,
// а код, verifier и redirect URI — один общий invalid_grant.
export class NativeTokenDto implements NativeTokenInput {
  @IsString()
  @IsNotEmpty()
  grant_type!: string;

  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  code_verifier!: string;
}
