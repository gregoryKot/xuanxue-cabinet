import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelModelModule } from '../channels/channel-model.module';
import { BotIdentityModule } from '../telegram/bot-identity.module';
import { UserRecord, UserSchema } from './user.schema';
import { InviteLinkRecord, InviteLinkSchema } from './invite-link.schema';
import {
  TelegramLinkCodeRecord,
  TelegramLinkCodeSchema,
} from './telegram-link-code.schema';
import { EmailLinkTokenRecord, EmailLinkTokenSchema } from './email-link-token.schema';
import { EmailLinkTokenService } from './email-link-token.service';
import { EmailLoginUserService } from './email-login-user.service';
import { InviteLinkService } from './invite-link.service';
import { LoginIdentityService } from './login-identity.service';
import { MyNoTelegramController } from './my-no-telegram.controller';
import { MyProfileController } from './my-profile.controller';
import { TeachersService } from './teachers.service';
import { TelegramLinkCodeService } from './telegram-link-code.service';
import { TelegramLinkService } from './telegram-link.service';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import { UserDeletionService } from './user-deletion.service';
import { UserEmailService } from './user-email.service';
import { UserNamesService } from './user-names.service';
import { UserNoTelegramService } from './user-no-telegram.service';
import { UserProfileService } from './user-profile.service';
import { UserRolesService } from './user-roles.service';
import { UserStatusService } from './user-status.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // BotIdentityModule — имя бота для InviteLinkDto.telegramUrl, без импорта
  // TelegramModule целиком (bot-identity.service.ts). ChannelsModule (для
  // группового автоподтверждения, ADR-0026) больше не нужен — механика
  // удалена целиком (ADR-0036); ChannelModelModule — за другим: только модель
  // ChannelRecord для UserBotChatStatusService (MeDto.botChatActive у PATCH
  // /me/profile и PUT /me/no-telegram, ADR-0087) — полный ChannelsModule
  // сюда не завести, у него нет причины знать про UsersModule, а полный
  // TelegramModule (у которого есть готовый PersonalChats.hasActiveChatFor)
  // сам импортирует UsersModule — обратный импорт закольцевал бы граф
  // (ADR-0013, тот же приём, что LessonModelModule/UserModelModule).
  imports: [
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: InviteLinkRecord.name, schema: InviteLinkSchema },
      { name: TelegramLinkCodeRecord.name, schema: TelegramLinkCodeSchema },
      { name: EmailLinkTokenRecord.name, schema: EmailLinkTokenSchema },
    ]),
    BotIdentityModule,
    ChannelModelModule,
  ],
  controllers: [UsersController, MyProfileController, MyNoTelegramController],
  providers: [
    UsersService,
    UserRolesService,
    UserStatusService,
    TeachersService,
    UserDeletionService,
    UserNamesService,
    UserProfileService,
    UserNoTelegramService,
    UserBotChatStatusService,
    UserEmailService,
    EmailLoginUserService,
    InviteLinkService,
    LoginIdentityService,
    TelegramLinkCodeService,
    TelegramLinkService,
    EmailLinkTokenService,
  ],
  // InviteLinkService — наружу для AuthModule (LoginIdentityService,
  // EmailAuthService — inviteCode в письме входа, ADR-0030) и JoinController
  // (`/auth/join/check`). LoginIdentityService — наружу для AuthModule
  // (TelegramAuthService, EmailAuthService, ADR-0030/0036) и TelegramModule
  // (/start join_<code>): единая точка «найти или завести человека при входе»
  // живёт в users/, а не в auth/, по тем же причинам, что и раньше (ADR-0013 —
  // обратный импорт AuthModule → TelegramModule → UsersModule закольцевал бы
  // граф, если бы сервис жил в auth/). TelegramLinkCodeService/
  // TelegramLinkService — той же причиной наружу (ADR-0034):
  // TelegramLinkController (auth/, выпуск кода) и TelegramModule
  // (/start link_<code>, потребление кода) оба берут их отсюда, второй раз не
  // заводим. UserEmailService/EmailLinkTokenService — той же причиной наружу
  // (ADR-0059): EmailLinkService (auth/) собирает привязку почты из них
  // обоих, второй раз не заводим.
  exports: [
    UsersService,
    UserNamesService,
    InviteLinkService,
    LoginIdentityService,
    TelegramLinkCodeService,
    TelegramLinkService,
    UserEmailService,
    EmailLinkTokenService,
  ],
})
export class UsersModule {}
