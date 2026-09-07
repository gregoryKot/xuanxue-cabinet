// Тонкий контроллер — прокидывает тело в handleUpdate() (CLAUDE.md «Логика
// вне контроллеров»). Гварды/CSRF/403/200 — telegram-webhook.e2e-spec.ts.
import type { Update } from 'telegraf/types';
import type { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';

describe('TelegramController', () => {
  it('webhook() передаёт тело запроса в TelegramBotService.handleUpdate', async () => {
    const handleUpdate = jest.fn().mockResolvedValue(undefined);
    const controller = new TelegramController({
      handleUpdate,
    } as unknown as TelegramBotService);
    const body = { update_id: 1, message: { text: '/start' } };

    await controller.webhook(body);

    expect(handleUpdate).toHaveBeenCalledWith(body as unknown as Update);
  });
});
