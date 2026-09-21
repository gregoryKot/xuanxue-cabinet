// Вход по коду из письма (ADR-0104) — второй способ потратить ту же заявку,
// что и ссылка (EmailAuthService.verifyCode). Отдельный файл, не метод в
// AuthController: тот уже у потолка 150 строк (file-size-ratchet), тот же
// приём, что у EmailLinkController (комментарий там же).
import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import type { ResponseLike } from '../common/http-headers';
import { Public } from './auth.decorators';
import { EmailAuthService } from './email-auth.service';
import { EMAIL_LOGIN_THROTTLE } from './login-throttle';
import { toMeDto } from './user.mapper';
import { VerifyEmailCodeDto } from './verify-email-code.dto';

@Controller('auth')
export class EmailCodeController {
  constructor(
    private readonly emailAuthService: EmailAuthService,
    private readonly personalChats: PersonalChats,
  ) {}

  @Public()
  @Throttle(EMAIL_LOGIN_THROTTLE)
  @Post('email/code')
  @HttpCode(HttpStatus.OK)
  async verifyEmailCode(
    @Body() body: VerifyEmailCodeDto,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<MeDto> {
    const { user, cookie } = await this.emailAuthService.verifyCode(
      body.email,
      body.code,
      DateTime.utc(),
      body.inviteCode,
    );
    res.setHeader('Set-Cookie', cookie);
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }
}
