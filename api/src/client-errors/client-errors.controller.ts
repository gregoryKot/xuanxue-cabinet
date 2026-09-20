// POST /client-errors — приём отчёта браузера о сбое (ADR-0071, вторая
// половина ADR-0053). Открыт всему интернету: упасть может и экран входа,
// до сессии (SECURITY §1) — приглашение по ссылке, форма входа.
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators';
import { requestIdOf, type RequestLike } from '../common/request-info';
import { ClientErrorsService } from './client-errors.service';
import { ReportClientErrorDto } from './report-client-error.dto';

// Строже глобального лимита (120/мин по IP, ThrottlerModule.forRoot в
// app.module.ts): идентичность здесь неверифицирована, бакет по IP
// (CLAUDE.md, правило №4) — пяти отчётов в минуту с адреса хватает даже при
// каскаде ошибок одной открытой вкладки, тот же профиль, что у
// JoinController/TelegramLinkController.
const CLIENT_ERROR_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('client-errors')
export class ClientErrorsController {
  constructor(private readonly clientErrorsService: ClientErrorsService) {}

  @Public()
  @Throttle(CLIENT_ERROR_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  report(@Body() body: ReportClientErrorDto, @Req() request: RequestLike): void {
    this.clientErrorsService.report(body, requestIdOf(request));
  }
}
