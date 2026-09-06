// /auth/me и /auth/logout — оба под глобальным AuthGuard. /auth/logout
// помечен @Public(): выход обязан чистить cookie даже без валидной сессии
// (протухший токен, чужая сессия на общем устройстве) — CSRF-проверка
// (x-requested-with) при этом всё равно действует, см. auth.guard.ts. Вход
// через Telegram добавит сюда /auth/telegram.
import { Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { ResponseLike } from './http-like';
import { toMeDto } from './user.mapper';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@CurrentUser() user: UserLean): MeDto {
    // AuthGuard уже сходил в UsersService.findById перед тем, как пропустить
    // запрос сюда — второй findById здесь был бы тем же чтением дважды.
    return toMeDto(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: ResponseLike): void {
    res.setHeader('Set-Cookie', this.authService.logoutCookie());
  }
}
