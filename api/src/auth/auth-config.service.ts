// Публичная конфигурация экрана входа — GET /auth/config (shared/src/auth.ts,
// AuthConfigDto). Вынесена из AuthController: тот у потолка 150 строк
// (file-size-ratchet), а полей в ответе прибавляется с каждым способом входа.
// Поля `*Enabled` — те же проверки, что перед самим действием (isEnabled()
// сервисов): один метод на оба места, кнопка не расходится с сервером.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthConfigDto } from '@xuanxue/shared';
import { SettingsService } from '../settings/settings.service';
import { FileStoreService } from '../storage/file-store.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { botIdFromToken } from './bot-id-from-token';
import { EmailAuthService } from './email-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { TelegramOidcService } from './telegram-oidc.service';

@Injectable()
export class AuthConfigService {
  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly telegramBotService: TelegramBotService,
    private readonly emailAuthService: EmailAuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly telegramOidcService: TelegramOidcService,
    private readonly fileStore: FileStoreService,
  ) {}

  async get(): Promise<AuthConfigDto> {
    const settings = await this.settingsService.get();
    return {
      telegramBotId: botIdFromToken(this.configService.get<string>('BOT_TOKEN')),
      telegramBotUsername: this.telegramBotService.botUsername(),
      schoolSiteUrl: settings.schoolSiteUrl,
      dataControllerName: settings.dataControllerName,
      dataControllerContact: settings.dataControllerContact,
      emailLoginEnabled: this.emailAuthService.isEnabled(),
      googleLoginEnabled: this.googleAuthService.isEnabled(),
      telegramOidcEnabled: this.telegramOidcService.isEnabled(),
      fileStorageEnabled: this.fileStore.isEnabled,
    };
  }
}
