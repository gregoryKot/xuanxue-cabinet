import { Equals, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NATIVE_TOKEN_TYPE_HINT, type NativeRevokeInput } from '@xuanxue/shared';

// Поля формы revoke (профиль Workshop 3c98d4a). Повтор имени в форме приходит
// массивом и не проходит @IsString, неизвестное поле роняет forbidNonWhitelisted
// — оба случая фильтр превращает в invalid_request. Чей client_id — решает
// контроллер (invalid_client), чей токен — сервис: любой непустой токен, в том
// числе чужой, получает тот же 200, что настоящий.
export class NativeRevokeDto implements NativeRevokeInput {
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsOptional()
  @Equals(NATIVE_TOKEN_TYPE_HINT)
  token_type_hint?: typeof NATIVE_TOKEN_TYPE_HINT;
}
