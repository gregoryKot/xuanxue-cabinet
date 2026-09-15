import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelsModule } from '../channels/channels.module';
import { UserRecord, UserSchema } from './user.schema';
import { InviteLinkRecord, InviteLinkSchema } from './invite-link.schema';
import { EmailLoginUserService } from './email-login-user.service';
import { InviteLinkService } from './invite-link.service';
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
  imports: [
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: InviteLinkRecord.name, schema: InviteLinkSchema },
    ]),
    ChannelsModule,
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
  ],
  // StudentMembershipApprovalService — наружу для AuthModule (перепроверка
  // при входе) и TelegramModule (ChatMemberJoinHandler, апдейт chat_member).
  // EmailLoginUserService — наружу для AuthModule (EmailAuthService, ADR-0029).
  // UserRolesService — наружу для AuthModule (JoinByInviteService переиспользует
  // approve(), а не пишет второй переход invited → active, ADR-0030).
  // InviteLinkService — наружу для AuthModule (JoinByInviteService.isValid,
  // EmailAuthService — inviteCode в письме входа, ADR-0030).
  exports: [
    UsersService,
    UserNamesService,
    UserRolesService,
    StudentMembershipApprovalService,
    EmailLoginUserService,
    InviteLinkService,
  ],
})
export class UsersModule {}
