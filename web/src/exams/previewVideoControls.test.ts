// Сборка управления видео-вопросом для предпросмотра (previewVideoControls.ts):
// из конфигурации входа берутся только бот и хранилище файлов, всё остальное
// — постоянные значения «ученик с привязанным Telegram, форма ждёт ответа».
import { describe, expect, it } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { previewVideoControls } from './previewVideoControls';

const CONFIG: AuthConfigDto = {
  emailLoginEnabled: true,
  fileStorageEnabled: true,
  googleLoginEnabled: false,
  telegramBotUsername: 'xuanxue_bot',
};

describe('previewVideoControls', () => {
  it('конфигурация есть — бот и загрузка файлом берутся из неё', () => {
    const controls = previewVideoControls(CONFIG);

    expect(controls.telegramBotUsername).toBe('xuanxue_bot');
    expect(controls.fileUploadEnabled).toBe(true);
  });

  it('конфигурации нет или хранилище выключено — загрузки и бота нет', () => {
    expect(previewVideoControls(null)).toMatchObject({
      telegramBotUsername: undefined,
      fileUploadEnabled: false,
    });
    expect(
      previewVideoControls({ ...CONFIG, fileStorageEnabled: false }).fileUploadEnabled,
    ).toBe(false);
  });

  it('путь ученика с привязанным Telegram, форма принимает ответы, видео ещё нет', () => {
    const controls = previewVideoControls(CONFIG);

    expect(controls).toMatchObject({
      telegramLinked: true,
      offersTelegramLink: false,
      acceptsAnswers: true,
      media: [],
    });
    expect(controls.linkStateFor('i1')).toEqual({ pending: false, error: null });
  });

  it('обработчики ничего не делают: ссылка не сохраняется', async () => {
    const controls = previewVideoControls(CONFIG);

    expect(await controls.addMediaLink('i1', 'https://example.com/v')).toBe(false);
    expect(
      controls.applyMedia({
        id: 'm1',
        attemptId: 'preview',
        kind: 'link',
        receivedAt: '2026-10-02T00:00:00Z',
      }),
    ).toBeUndefined();
  });
});
