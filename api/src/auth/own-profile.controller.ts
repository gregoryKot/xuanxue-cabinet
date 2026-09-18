// PATCH /me/profile — человек меняет своё имя: вход по почте заводит name,
// равным самой почте (email-login-user.service.ts), и до этого эндпоинта
// поправить это было нечем — учитель видел на карточке проверки заголовок
// вида `doctor.martynova@gmail.com`.
//
// Контроллер живёт в auth/ и регистрируется в AuthModule.controllers, а не
// в UsersModule: ответ собирает toMeDto (user.mapper.ts), которому нужен
// PersonalChats из TelegramModule, а TelegramModule сам импортирует
// UsersModule — обратный импорт UsersModule → TelegramModule закольцевал бы
// граф (ADR-0013). AuthModule уже импортирует и UsersModule (отсюда
// OwnNameService, экспорт UsersModule), и TelegramModule (отсюда
// PersonalChats); в модуле уже не один контроллер — рядом с AuthController
// есть JoinController и TelegramLinkController (оба тоже под префиксом
// 'auth', но отдельными классами по той же причине — провайдер модуля
// нужен только здесь). Свой префикс `me/profile`, не `auth/*`, — не первое
// исключение из «один модуль — один URL-неймспейс», просто первое, где сам
// путь тоже расходится с именем модуля.
import { Body, Controller, Patch } from '@nestjs/common';
import type { MeDto } from '@xuanxue/shared';
import { OwnNameService } from '../users/own-name.service';
import type { UserLean } from '../users/users.service';
import { PersonalChats } from '../telegram/personal-chats';
import { CurrentUser } from './auth.decorators';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toMeDto } from './user.mapper';

@Controller('me/profile')
export class OwnProfileController {
  constructor(
    private readonly ownNameService: OwnNameService,
    private readonly personalChats: PersonalChats,
  ) {}

  // Без @Roles: доступно любой роли, включая ученика без единой роли, —
  // человек правит только свой аккаунт (тот же приём, что у
  // NotificationPrefsController). Возвращает полный MeDto, чтобы кабинет
  // обновил сессию одним ответом, без отдельного GET /auth/me следом (тот
  // же приём, что у NotificationPrefsController.update).
  @Patch()
  async update(
    @Body() body: UpdateProfileDto,
    @CurrentUser() user: UserLean,
  ): Promise<MeDto> {
    const updated = await this.ownNameService.renameSelf(user.id, body.name);
    return toMeDto(updated, await this.personalChats.hasActiveChatFor(updated));
  }
}
