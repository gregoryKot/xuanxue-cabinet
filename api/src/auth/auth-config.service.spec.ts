// Тесты сборки GET /auth/config (auth-config.service.ts) — бывшие тесты
// AuthController.getConfig: фейки провайдеров, без HTTP и без Mongo.
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import { SettingsService } from '../settings/settings.service';
import { FileStoreService } from '../storage/file-store.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { AuthConfigService } from './auth-config.service';
import { EmailAuthService } from './email-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { TelegramOidcService } from './telegram-oidc.service';

const SETTINGS_WITHOUT_SITE: SettingsDto = {
  templates: { lesson_link: 'ссылка', recording: 'запись' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  lessonReminderMinutes: DEFAULT_LESSON_REMINDER_MINUTES,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentContact: DEFAULT_PAYMENT_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

interface BuildOptions {
  env?: Record<string, string | undefined>;
  settings?: SettingsDto;
  // Имя бота приходит из уже прогретого botInfo — в тестах подменяем фейком,
  // сети тут нет (CLAUDE.md «Тесты»).
  botUsername?: string;
  emailLoginEnabled?: boolean;
  googleLoginEnabled?: boolean;
  telegramOidcEnabled?: boolean;
  // Хранилище файлов (ADR-0057) — сервис только пересказывает
  // `FileStoreService.isEnabled`, в сеть не ходит ни он, ни фейк.
  fileStorageEnabled?: boolean;
}

async function buildService(options: BuildOptions = {}): Promise<AuthConfigService> {
  const env = options.env ?? {};
  const module = await Test.createTestingModule({
    providers: [
      AuthConfigService,
      { provide: ConfigService, useValue: { get: (name: string) => env[name] } },
      {
        provide: SettingsService,
        useValue: {
          get: () => Promise.resolve(options.settings ?? SETTINGS_WITHOUT_SITE),
        },
      },
      {
        provide: TelegramBotService,
        useValue: { botUsername: () => options.botUsername },
      },
      {
        provide: EmailAuthService,
        useValue: { isEnabled: () => options.emailLoginEnabled ?? false },
      },
      {
        provide: GoogleAuthService,
        useValue: { isEnabled: () => options.googleLoginEnabled ?? false },
      },
      {
        provide: TelegramOidcService,
        useValue: { isEnabled: () => options.telegramOidcEnabled ?? false },
      },
      {
        provide: FileStoreService,
        useValue: { isEnabled: options.fileStorageEnabled ?? false },
      },
    ],
  }).compile();
  return module.get(AuthConfigService);
}

describe('AuthConfigService.get', () => {
  it('без BOT_TOKEN — telegramBotId отсутствует, все способы входа выключены', async () => {
    const service = await buildService();
    await expect(service.get()).resolves.toEqual({
      telegramBotId: undefined,
      telegramBotUsername: undefined,
      schoolSiteUrl: undefined,
      emailLoginEnabled: false,
      googleLoginEnabled: false,
      telegramOidcEnabled: false,
      fileStorageEnabled: false,
    });
  });

  it('с BOT_TOKEN и заполненным адресом сайта — оба поля в ответе', async () => {
    const service = await buildService({
      env: { BOT_TOKEN: '123456:abcDEFghi-token_padding_here' },
      settings: { ...SETTINGS_WITHOUT_SITE, schoolSiteUrl: 'https://xuanxue.su' },
    });
    await expect(service.get()).resolves.toMatchObject({
      telegramBotId: 123456,
      schoolSiteUrl: 'https://xuanxue.su',
    });
  });

  // Ответственный за данные — публичный текст для страницы /privacy: что
  // школа заполнила в настройках, то и уходит гостю, без правок по дороге.
  it('ответственный за данные заполнен — имя и контакт в ответе', async () => {
    const service = await buildService({
      settings: {
        ...SETTINGS_WITHOUT_SITE,
        dataControllerName: 'Дмитрий Дейч',
        dataControllerContact: 'privacy@xuanxue.su',
      },
    });
    await expect(service.get()).resolves.toMatchObject({
      dataControllerName: 'Дмитрий Дейч',
      dataControllerContact: 'privacy@xuanxue.su',
    });
  });

  it('ответственный не указан — полей в ответе нет', async () => {
    const config = await (await buildService()).get();
    expect(config.dataControllerName).toBeUndefined();
    expect(config.dataControllerContact).toBeUndefined();
  });

  // Имя бота нужно кабинету для ссылки «Отправить видео» (ADR-0023): бот
  // ответил при старте — имя есть; не ответил — поля нет, и кнопки не будет.
  it('бот прогрет — имя бота в ответе', async () => {
    const service = await buildService({ botUsername: 'xuanxue_bot' });
    await expect(service.get()).resolves.toMatchObject({
      telegramBotUsername: 'xuanxue_bot',
    });
  });

  // Каждый *Enabled — целиком ответ isEnabled() своего сервиса (CLAUDE.md
  // «Дубли»): сборка не пересчитывает условие сама, только проксирует.
  it.each([
    ['emailLoginEnabled', 'emailLoginEnabled'],
    ['googleLoginEnabled', 'googleLoginEnabled'],
    ['telegramOidcEnabled', 'telegramOidcEnabled'],
    ['fileStorageEnabled', 'fileStorageEnabled'],
  ] as const)('%s решает ответ своего сервиса', async (field, option) => {
    const off = await buildService({ [option]: false });
    const on = await buildService({ [option]: true });

    expect((await off.get())[field]).toBe(false);
    expect((await on.get())[field]).toBe(true);
  });

  it('включён один способ — остальные флаги не сдвигаются', async () => {
    const service = await buildService({ telegramOidcEnabled: true });
    await expect(service.get()).resolves.toMatchObject({
      emailLoginEnabled: false,
      googleLoginEnabled: false,
      telegramOidcEnabled: true,
      fileStorageEnabled: false,
    });
  });
});
