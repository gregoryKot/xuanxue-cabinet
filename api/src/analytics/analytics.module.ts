// PostHog (ADR-0143) — единственный провайдер области сейчас ConfigService,
// он уже глобален (ConfigModule.forRoot({ isGlobal: true }), app.module.ts),
// поэтому модуль состоит из одного контроллера.
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
