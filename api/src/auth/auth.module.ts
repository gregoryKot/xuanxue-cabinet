// Сессия и гварды (ADR-0012). AuthGuard — глобальный APP_GUARD (см.
// комментарий в auth.guard.ts про порядок относительно ThrottlerGuard из
// AppModule). SESSION_SECRET — единственный провайдер секрета: JWT_SECRET из
// ConfigService, если задан, иначе временный секрет на процесс (в production
// JWT_SECRET гарантирован env.validation.ts).
import { randomBytes } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SESSION_SECRET } from './session-token';
import { TelegramAuthService } from './telegram-auth.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TelegramAuthService,
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
