import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelsModule } from '../channels/channels.module';
import { BotIdentityModule } from '../telegram/bot-identity.module';
import { UserRecord, UserSchema } from './user.schema';
import { InviteLinkRecord, InviteLinkSchema } from './invite-link.schema';
import { EmailLoginUserService } from './email-login-user.service';
import { InviteLinkService } from './invite-link.service';
import { JoinByInviteService } from './join-by-invite.service';
import { StudentMembershipApprovalService } from './student-membership-approval.service';
import { TeachersService } from './teachers.service';
import { UserDeletionService } from './user-deletion.service';
import { UserNamesService } from './user-names.service';
import { UserRolesService } from './user-roles.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // ChannelsModule — GroupMembershipService для
  // StudentMembershipApprovalService (перепроверка `invited` по группе,
  // ADR-0026). ChannelsModule сам UsersModule не импортирует (только
  // ClassesModule → UserModelModule, лёгкий модуль с одной моделью, не с
  // этим модулем целиком) — цикла нет, тот же приём, что у AuthModule.
  // BotIdentityModule — имя бота для InviteLinkDto.telegramUrl, без импорта
  // TelegramModule целиком (bot-identity.service.ts).
  imports: [
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: InviteLinkRecord.name, schema: InviteLinkSchema },
    ]),
    ChannelsModule,
    BotIdentityModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRolesService,
    TeachersService,
    UserDeletionService,
    UserNamesService,
    StudentMembershipApprovalService,
    EmailLoginUserService,
    InviteLinkService,
    JoinByInviteService,
  ],
  // StudentMembershipApprovalService — наружу для AuthModule (перепроверка
  // при входе) и TelegramModule (ChatMemberJoinHandler, апдейт chat_member).
  // EmailLoginUserService — наружу для AuthModule (EmailAuthService, ADR-0029).
  // UserRolesService — наружу для AuthModule (JoinByInviteService переиспользует
  // approve(), а не пишет второй переход invited → active, ADR-0030).
  // InviteLinkService — наружу для AuthModule (JoinByInviteService.isValid,
  // EmailAuthService — inviteCode в письме входа, ADR-0030). JoinByInviteService
  // — наружу для AuthModule (JoinController, HTTP-вход) и TelegramModule
  // (/start join_<code>, ADR-0030 «Бот»): сам сервис живёт в users/, а не в
  // auth/, потому что AuthModule уже импортирует TelegramModule — обратный
  // импорт закольцевал бы граф (ADR-0013), а UsersModule нужен обоим и без
  // ссылки-приглашения.
  exports: [
    UsersService,
    UserNamesService,
    UserRolesService,
    StudentMembershipApprovalService,
    EmailLoginUserService,
    InviteLinkService,
    JoinByInviteService,
  ],
})
export class UsersModule {}
