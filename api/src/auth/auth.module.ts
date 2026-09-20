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
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { EmailLinkController } from './email-link.controller';
import { EmailLinkService } from './email-link.service';
import { EmailLoginTokenRecord, EmailLoginTokenSchema } from './email-login-token.schema';
import { EmailLoginTokenService } from './email-login-token.service';
import { JoinController } from './join.controller';
import { SESSION_SECRET } from './session-token';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramLinkController } from './telegram-link.controller';

@Module({
  // SettingsModule — GET /auth/config берёт schoolSiteUrl из
  // SettingsService.get() (В6 аудита); SettingsModule сам не импортирует
  // AuthModule (импортирует ClassesModule/LessonModelModule/UsersModule) —
  // цикла нет (ADR-0013, тот же приём, что у TelegramModule). MailModule —
  // MailService для email-входа (ADR-0029), своего AuthModule не
  // импортирует. EmailLoginTokenRecord регистрируется здесь же (не в
  // UsersModule): токен не про пользователя, он про сам вход.
  imports: [
    UsersModule,
    SettingsModule,
    TelegramModule,
    MailModule,
    MongooseModule.forFeature([
      { name: EmailLoginTokenRecord.name, schema: EmailLoginTokenSchema },
    ]),
  ],
  controllers: [
    AuthController,
    JoinController,
    TelegramLinkController,
    EmailLinkController,
  ],
  providers: [
    AuthService,
    TelegramAuthService,
    EmailAuthService,
    EmailLoginTokenService,
    EmailLinkService,
    // Ссылка-приглашение школы (ADR-0030/0036): InviteLinkService и
    // LoginIdentityService приходят как экспорт UsersModule (импортирован
    // выше, второй провайдер здесь не заводим).
    // Связка Telegram (ADR-0034): TelegramLinkCodeService для
    // TelegramLinkController — тем же путём, экспорт UsersModule.
    // Привязка почты (ADR-0059): EmailLinkService берёт
    // EmailLinkTokenService/UserEmailService как экспорт UsersModule
    // (импортирован выше) и MailService — как экспорт MailModule, второй раз
    // их не заводим.
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
