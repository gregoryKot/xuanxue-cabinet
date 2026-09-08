// Тело POST /auth/telegram. Поля — snake_case: контракт Telegram Login
// Widget, не наш API (см. комментарий у TelegramLoginInput в shared/src/auth.ts).
// Рантайм-валидация — не глобальный ValidationPipe (тот с forbidNonWhitelisted,
// app.setup.ts), а parseTelegramLoginBody (parse-telegram-login-body.ts) со
// своим class-validator({ whitelist: true }) без этой опции — см. причину там.
//
// В подписи Telegram этот DTO не участвует: isValidTelegramLogin считает
// data-check-string по сырому `req.body`, а не по значениям этих полей
// (см. telegram-login.ts) — whitelist: true строит DTO только из известных
// полей, и лишние поля, которые прислал клиент вместе с ID и hash, здесь
// просто отбрасываются. Это безопасно: они всё равно под HMAC в сыром теле,
// подделать их отдельно от остальных нельзя.
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { TELEGRAM_HASH_RE } from './telegram-login';

const NAME_MAX_LENGTH = 64;

export class TelegramLoginDto implements TelegramLoginInput {
  @IsInt()
  @IsPositive()
  id!: number;

  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  first_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  username?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  photo_url?: string;

  @IsInt()
  auth_date!: number;

  // Продолжение фразы «Подпись входа: …» (validation-messages.ts) — без
  // повтора имени поля и согласовано с родом подписи-слова (не «hash»).
  @Matches(TELEGRAM_HASH_RE, { message: 'должна быть строкой из 64 hex-символов.' })
  hash!: string;
}
