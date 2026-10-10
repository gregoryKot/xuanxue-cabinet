// Нативный Daychi читает аккаунт, продлевает и отзывает свой доступ (ADR-0181,
// профиль Workshop 3c98d4a). Веб сюда не ходит, поэтому у маршрутов нет
// @ApiRoute (карта shared/src/*-routes.ts — про запросы веба).
//
// Все маршруты — @Public() и @SkipCsrf(): их защищает явный секрет в запросе
// (bearer или сам отзываемый токен), а не cookie. Заголовок x-requested-with —
// защита браузерных форм, нативный клиент его не шлёт и по профилю не обязан;
// cookie сессии им не нужна и ничего не подменяет, AuthGuard bearer не читает.
// Троттлинг — по IP: bearer проверяется в базе, до трекера не верифицирован.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import {
  NATIVE_CLIENT_ID,
  type NativeAccountResponse,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import { Public, SkipCsrf } from '../auth/auth.decorators';
import { NATIVE_AUTH_THROTTLE } from '../auth/login-throttle';
import { toMeDto } from '../auth/user.mapper';
import { PersonalChats } from '../telegram/personal-chats';
import { NativeAuthError } from './native-auth-error';
import { NativeErrorFilter } from './native-error.filter';
import { NativeGrantsService } from './native-grants.service';
import {
  assertEmptyJsonObject,
  assertFormRequest,
  assertNoRequestInput,
  bearerTokenOf,
  type NativeRequestLike,
} from './native-http';
import { NativeNoStoreInterceptor } from './native-response';
import { NativeRevokeDto } from './native-revoke.dto';

@Public()
@SkipCsrf()
@Throttle(NATIVE_AUTH_THROTTLE)
@UseFilters(NativeErrorFilter)
@UseInterceptors(NativeNoStoreInterceptor)
@Controller('auth/native')
export class NativeAccountController {
  constructor(
    private readonly grants: NativeGrantsService,
    private readonly personalChats: PersonalChats,
  ) {}

  @Get('me')
  async me(@Req() req: NativeRequestLike): Promise<NativeAccountResponse> {
    assertNoRequestInput(req);
    const now = DateTime.utc();
    const { user, credential } = await this.grants.authenticate(bearerTokenOf(req), now);
    return {
      // Тот же маппер, что у GET /auth/me: совпадение с вебом (N01) держится
      // одной функцией, а не копией.
      account: toMeDto(user, await this.personalChats.hasActiveChatFor(user)),
      session: this.grants.sessionView(credential, now),
    };
  }

  @Post('renew')
  @HttpCode(HttpStatus.OK)
  renew(@Req() req: NativeRequestLike): Promise<NativeTokenResponse> {
    assertEmptyJsonObject(req);
    return this.grants.renew(bearerTokenOf(req), DateTime.utc());
  }

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Req() req: NativeRequestLike,
    @Body() body: NativeRevokeDto,
  ): Promise<void> {
    assertFormRequest(req);
    if (body.client_id !== NATIVE_CLIENT_ID) throw new NativeAuthError('invalid_client');
    await this.grants.revoke(body.token, DateTime.utc());
  }
}
