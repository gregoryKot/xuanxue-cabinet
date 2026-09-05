import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { LoggingModule } from './logging/logging.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { MigrationsModule } from './migrations/migrations.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggingModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    // По умолчанию — по IP (правило CLAUDE.md №4: неверифицированная
    // идентичность бакетируется по IP; верифицированный JWT/initData —
    // задача будущих модулей auth, ThrottlerGuard переопределяется там же).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    MigrationsModule,
    // Раздаёт web/dist с корня, /api/* остаётся за контроллерами Nest.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*splat}'],
    }),
  ],
  controllers: [HealthController],
  providers: [DomainExceptionFilter, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
