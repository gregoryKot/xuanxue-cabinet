// GET /push/public-key — публичный ключ VAPID для будущего
// `pushManager.subscribe({ applicationServerKey })` (ADR-0092, кнопка — PR
// №5). Требует сессии, как остальные маршруты push этого PR: показывать её
// есть смысл только вошедшему. Сам ключ не секрет (VAPID отдаёт публичный
// ключ любому клиенту) — секретов в ответе нет.
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushPublicKeyDto } from '@xuanxue/shared';
import { readVapidConfig } from './vapid.config';

@Controller('push')
export class PushKeyController {
  constructor(private readonly config: ConfigService) {}

  @Get('public-key')
  getPublicKey(): PushPublicKeyDto {
    return { publicKey: readVapidConfig(this.config)?.publicKey ?? null };
  }
}
