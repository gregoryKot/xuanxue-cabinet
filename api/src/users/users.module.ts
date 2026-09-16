import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotIdentityModule } from '../telegram/bot-identity.module';
import { UserRecord, UserSchema } from './user.schema';
import { InviteLinkRecord, InviteLinkSchema } from './invite-link.schema';
import { EmailLoginUserService } from './email-login-user.service';
import { InviteLinkService } from './invite-link.service';
import { LoginIdentityService } from './login-identity.service';
import { TeachersService } from './teachers.service';
import { UserDeletionService } from './user-deletion.service';
import { UserNamesService } from './user-names.service';
import { UserRolesService } from './user-roles.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // BotIdentityModule — имя бота для InviteLinkDto.telegramUrl, без импорта
  // TelegramModule целиком (bot-identity.service.ts). ChannelsModule (для
  // группового автоподтверждения, ADR-0026) больше не нужен — механика
  // удалена целиком (ADR-0034).
  imports: [
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: InviteLinkRecord.name, schema: InviteLinkSchema },
    ]),
    BotIdentityModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRolesService,
    TeachersService,
    UserDeletionService,
    UserNamesService,
    EmailLoginUserService,
    InviteLinkService,
    LoginIdentityService,
  ],
  // InviteLinkService — наружу для AuthModule (LoginIdentityService,
  // EmailAuthService — inviteCode в письме входа, ADR-0030) и JoinController
  // (`/auth/join/check`). LoginIdentityService — наружу для AuthModule
  // (TelegramAuthService, EmailAuthService, ADR-0030/0034): единая точка
  // «найти или завести человека при входе» живёт в users/, а не в auth/, по
  // тем же причинам, что и раньше (ADR-0013 — обратный
  // импорт AuthModule → TelegramModule → UsersModule закольцевал бы граф,
  // если бы сервис жил в auth/).
  exports: [UsersService, UserNamesService, InviteLinkService, LoginIdentityService],
})
export class UsersModule {}
