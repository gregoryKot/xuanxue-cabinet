// Привязка почты к уже вошедшему человеку (ADR-0059) — отдельный файл, не
// метод в AuthController: тот уже у потолка 150 строк (file-size-ratchet),
// тот же приём, что у TelegramLinkController (комментарий там же).
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import type { UserLean } from '../users/users.service';
import { CurrentUser, Public } from './auth.decorators';
import { ConfirmEmailDto } from './confirm-email.dto';
import { EmailLinkService } from './email-link.service';
import { LinkEmailDto } from './link-email.dto';
import { toMeDto } from './user.mapper';

// «Прислать ссылку ещё раз» обязано либо прислать письмо, либо честно
// сказать почему (docs/VOICE.md — текст ошибки говорит, что делать дальше):
// молчаливое «ничего не отправили», как у cooldown письма входа
// (EMAIL_LOGIN_RESEND_COOLDOWN_MIN), здесь хуже — запрос на /email/link
// приходит от уже вошедшей, верифицированной сессии (CLAUDE.md №4), а не от
// анонимного клиента, которого стоит придержать молча. Простой лимит в
// минуту — достаточная защита от случайного цикла кликов, тот же профиль,
// что у TELEGRAM_LINK_CODE_THROTTLE.
const EMAIL_LINK_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class EmailLinkController {
  constructor(
    private readonly emailLinkService: EmailLinkService,
    private readonly personalChats: PersonalChats,
  ) {}

  // Возвращает MeDto — тот же, что GET /auth/me, собранный тем же toMeDto()
  // — не 204: в ответе важен появившийся pendingEmail (ADR-0059), а «Профиль»
  // кладёт его прямо на экран вместо повторного GET (ADR-0087, «Последствия»).
  // PersonalChats доступен здесь без нового цикла в графе Nest — AuthModule
  // уже импортирует TelegramModule ради AuthController (тот же провайдер).
  // Без @Public: адрес привязывается только вошедшей сессии. `id` — только
  // из сессии (@CurrentUser()), никогда из тела запроса (SECURITY §2) —
  // иначе один человек мог бы привязать почту к чужому аккаунту, просто
  // отправив его id.
  @Throttle(EMAIL_LINK_THROTTLE)
  @Post('email/link')
  @HttpCode(HttpStatus.OK)
  async link(@Body() body: LinkEmailDto, @CurrentUser() user: UserLean): Promise<MeDto> {
    const updated = await this.emailLinkService.link(user, body.email, DateTime.utc());
    return toMeDto(updated, await this.personalChats.hasActiveChatFor(updated));
  }

  // @Public() нарочно: письмо человек открывает там, где ему удобно — в
  // почтовом клиенте на телефоне, в другом браузере, — сессии кабинета на
  // этом устройстве может не быть вовсе. Сам метод сессию не выпускает и
  // cookie не ставит (EmailLinkService.confirm).
  @Public()
  @Throttle(EMAIL_LINK_THROTTLE)
  @Post('email/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirm(@Body() body: ConfirmEmailDto): Promise<void> {
    await this.emailLinkService.confirm(body.token, DateTime.utc());
  }
}
