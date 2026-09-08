// POST /auth/telegram — единственный маршрут, где глобальный ValidationPipe
// (whitelist + forbidNonWhitelisted, app.setup.ts) не годится: он один на всё
// приложение, а Nest не умеет отключить одну его опцию для одного маршрута —
// локальный `@UsePipes()` не заменяет глобальный пайп, а добавляется поверх
// него (тот уже успел бы упасть на forbidNonWhitelisted раньше, чем
// сработает локальный). Поэтому контроллер получает `@Body()` нетипизированным
// (`Record<string, unknown>`, как у /telegram/webhook) — под такой метатип
// ValidationPipe.toValidate() возвращает false и пайп его не трогает — и
// валидирует тело вручную, тем же class-validator, но без forbidNonWhitelisted:
// виджет Telegram подписывает HMAC'ом все переданные поля целиком
// (см. TelegramLoginDto), лишние безопасно отбрасывать молча, а не ронять
// вход всей школе, если Telegram однажды добавит виджету новое поле.
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { formatValidationErrors } from '../common/validation-messages';
import { TelegramLoginDto } from './telegram-login.dto';

export async function parseTelegramLoginBody(
  raw: Record<string, unknown>,
): Promise<TelegramLoginDto> {
  const instance = plainToInstance(TelegramLoginDto, raw);
  const errors = await validate(instance, { whitelist: true });
  if (errors.length > 0) {
    throw new BadRequestException(formatValidationErrors(errors));
  }
  return instance;
}
