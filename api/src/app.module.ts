import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validate';
import type { NodeEnv } from './config/env.validation';
import { LoggingModule } from './logging/logging.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { DatabaseModule } from './database/database.module';
import { MONGO_RUNTIME_ADAPTERS } from './database/mongo-runtime-adapters';
import { MigrationsModule } from './migrations/migrations.module';
import { ClassesModule } from './classes/classes.module';
import { LessonsModule } from './lessons/lessons.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ChannelsModule } from './channels/channels.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { ExamImagesModule } from './exam-images/exam-images.module';
import { ExamsModule } from './exams/exams.module';
import { GradingPresetsModule } from './grading-presets/grading-presets.module';
import { MaterialsModule } from './materials/materials.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { SettingsModule } from './settings/settings.module';
import { SummaryModule } from './summary/summary.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './seed/seed.module';
import { TelegramModule } from './telegram/telegram.module';
import { staticAssetsOptions } from './static/static-cache-control';

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
        // mongo-runtime-adapters.ts: обход бага хендшейка mongodb@7.6+ под Jest.
        runtimeAdapters: MONGO_RUNTIME_ADAPTERS,
      }),
    }),
    // Тик планировщика (SchedulerModule) можно выключить в e2e/юнит-тестах —
    // реальный тик остаётся в проде и в Docker-смоке CI (CLAUDE.md
    // «Деплой»): create-app.ts выставляет SCHEDULER_ENABLED='false' перед
    // импортом AppModule.
    ScheduleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        cronJobs: config.get<string>('SCHEDULER_ENABLED') !== 'false',
      }),
    }),
    // По умолчанию — по IP (правило CLAUDE.md №4: неверифицированная
    // идентичность бакетируется по IP; верифицированный JWT/initData —
    // задача будущих модулей auth, ThrottlerGuard переопределяется там же).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    MigrationsModule,
    ClassesModule,
    LessonsModule,
    SchedulerModule,
    ChannelsModule,
    BroadcastsModule,
    DeliveriesModule,
    ExamsModule,
    ExamImagesModule,
    GradingPresetsModule,
    MaterialsModule,
    NotificationsModule,
    PaymentsModule,
    SettingsModule,
    SummaryModule,
    UsersModule,
    // Без контроллера и планировщика — сервис для одноразового CLI-импорта
    // (seed-classes.ts, PLAN.md §9), в HTTP-приложении бездействует.
    SeedModule,
    // Гвард сессии (AuthGuard) — APP_GUARD внутри этого модуля, применяется
    // после ThrottlerGuard выше (@nestjs/core scanner: провайдеры AppModule
    // раньше провайдеров импортированных модулей).
    AuthModule,
    TelegramModule,
    // Раздаёт web/dist с корня, /api/* остаётся за контроллерами Nest.
    // Заголовки кеша (хэшированные ассеты — на год, index.html/sw.js —
    // no-cache) живут в static/static-cache-control.ts вместе с тестом.
    ServeStaticModule.forRoot(
      staticAssetsOptions(join(__dirname, '..', '..', 'web', 'dist')),
    ),
  ],
  controllers: [HealthController],
  providers: [DomainExceptionFilter, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
