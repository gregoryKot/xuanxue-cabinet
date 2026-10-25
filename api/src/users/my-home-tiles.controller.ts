// PUT /me/home-tiles — человек выбирает, какие плитки «Главной» ему показывать
// (ADR-0179). Без @Roles: настройка есть у каждого вошедшего, и менять её можно
// только себе — `id` берётся из сессии, не из пути и не из тела (SECURITY §2).
// Маршрут всё равно требует сессии (AuthGuard), не публичный.
import { Body, Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import type { MeDto } from '@xuanxue/shared';
import { ApiRoute } from '../common/api-route.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import { toMeDto } from '../auth/user.mapper';
import type { UserLean } from './users.service';
import { SetHomeTilesDto } from './dto/set-home-tiles.dto';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserHomeTilesService } from './user-home-tiles.service';

@Controller('me/home-tiles')
export class MyHomeTilesController {
  constructor(
    private readonly userHomeTilesService: UserHomeTilesService,
    private readonly userBotChatStatusService: UserBotChatStatusService,
  ) {}

  // Возвращает MeDto — тот же, что GET /auth/me, тем же toMeDto(): главная
  // перерисовывается по ответу без второго GET (ADR-0087). PUT, а не PATCH:
  // список целиком — идемпотентная установка значения.
  @ApiRoute('PUT /me/home-tiles')
  @Put()
  @HttpCode(HttpStatus.OK)
  async update(
    @Body() body: SetHomeTilesDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    const updated = await this.userHomeTilesService.setHidden(user.id, body.hidden);
    return toMeDto(
      updated,
      await this.userBotChatStatusService.hasActiveChatFor(updated),
    );
  }
}
