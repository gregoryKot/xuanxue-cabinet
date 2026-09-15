// Сессия и гварды (ADR-0012). AuthGuard — глобальный APP_GUARD (см.
// комментарий в auth.guard.ts про порядок относительно ThrottlerGuard из
// AppModule). SESSION_SECRET — единственный провайдер секрета: JWT_SECRET из
// ConfigService, если задан, иначе временный секрет на процесс (в production
// JWT_SECRET гарантирован env.validation.ts).
import { randomBytes } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Logger } from 'nestjs-pino';
import { ChannelsModule } from '../channels/channels.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { EmailLoginTokenRecord, EmailLoginTokenSchema } from './email-login-token.schema';
import { EmailLoginTokenService } from './email-login-token.service';
import { JoinController } from './join.controller';
import { SESSION_SECRET } from './session-token';
import { TelegramAuthService } from './telegram-auth.service';

@Module({
  // SettingsModule — GET /auth/config берёт schoolSiteUrl из
  // SettingsService.get() (В6 аудита); SettingsModule сам не импортирует
  // AuthModule (импортирует ClassesModule/LessonModelModule/UsersModule) —
  // цикла нет (ADR-0013, тот же приём, что у TelegramModule). ChannelsModule —
  // GroupMembershipService для автоподтверждения по группе (ADR-0026);
  // ChannelsModule импортирует ClassesModule и сам AuthModule не импортирует
  // (проверено — ни ChannelsModule, ни его импорты на AuthModule не ссылаются) —
  // цикла нет. MailModule — MailService для email-входа (ADR-0029), своего
  // AuthModule не импортирует. EmailLoginTokenRecord регистрируется здесь
  // же (не в UsersModule): токен не про пользователя, он про сам вход.
  imports: [
    UsersModule,
    SettingsModule,
    ChannelsModule,
    TelegramModule,
    MailModule,
    MongooseModule.forFeature([
      { name: EmailLoginTokenRecord.name, schema: EmailLoginTokenSchema },
    ]),
  ],
  controllers: [AuthController, JoinController],
  providers: [
    AuthService,
    TelegramAuthService,
    EmailAuthService,
    EmailLoginTokenService,
    // Ссылка-приглашение школы (ADR-0030): InviteLinkService/UserRolesService/
    // JoinByInviteService приходят как экспорт UsersModule (импортирован
    // выше, JoinByInviteService живёт там же — join-by-invite.service.ts,
    // комментарий в users.module.ts), второй провайдер здесь не заводим.
    { provide: APP_GUARD, useClass: AuthGuard },
    {
      provide: SESSION_SECRET,
      inject: [ConfigService, Logger],
      useFactory: (config: ConfigService, logger: Logger): string => {
        const configured = config.get<string>('JWT_SECRET');
        if (configured) return configured;
        logger.warn(
          'JWT_SECRET не задан — используется временный секрет процесса, ' +
            'все сессии слетят при рестарте (в production JWT_SECRET обязателен).',
          'AuthModule',
        );
        return randomBytes(32).toString('hex');
      },
    },
  ],
})
export class AuthModule {}
