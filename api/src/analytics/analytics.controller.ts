// GET /analytics/config — @Public(), тот же приём, что GET /auth/config
// (auth.controller.ts): фронт узнаёт, включена ли аналитика, ещё до сессии,
// чтобы useAnalytics.ts мог решить, грузить ли posthog-js, сразу после входа.
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnalyticsConfigDto } from '@xuanxue/shared';
import { Public } from '../auth/auth.decorators';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly configService: ConfigService) {}

  // Нет ключа — аналитика выключена целиком (ADR-0143, CLAUDE.md
  // «Рискованная фича — за флагом»): фронт даже не импортирует posthog-js.
  @Public()
  @Get('config')
  getConfig(): AnalyticsConfigDto {
    return { posthogKey: this.configService.get<string>('POSTHOG_KEY') ?? null };
  }
}
