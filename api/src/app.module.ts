import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv, type NodeEnv } from './config/env.validation';
import { LoggingModule } from './logging/logging.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { DatabaseModule } from './database/database.module';
import { MigrationsModule } from './migrations/migrations.module';
import { ClassesModule } from './classes/classes.module';
import { LessonsModule } from './lessons/lessons.module';
import { ChannelsModule } from './channels/channels.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggingModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
        // В production индексы строит только IndexSyncService при старте
        // (CLAUDE.md «Данные») — автостроение на живом трафике конкурирует
        // с этим и маскирует ошибку индекса до первого рестарта.
        autoIndex: config.get<NodeEnv>('NODE_ENV') !== 'production',
      }),
    }),
    ScheduleModule.forRoot(),
    // По умолчанию — по IP (правило CLAUDE.md №4: неверифицированная
    // идентичность бакетируется по IP; верифицированный JWT/initData —
    // задача будущих модулей auth, ThrottlerGuard переопределяется там же).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    MigrationsModule,
    ClassesModule,
    LessonsModule,
    ChannelsModule,
    BroadcastsModule,
    DeliveriesModule,
    UsersModule,
    // Гвард сессии (AuthGuard) — APP_GUARD внутри этого модуля, применяется
    // после ThrottlerGuard выше (@nestjs/core scanner: провайдеры AppModule
    // раньше провайдеров импортированных модулей).
    AuthModule,
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
