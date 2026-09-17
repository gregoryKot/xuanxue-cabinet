// Имя бота в Telegram (`@имя`), доступное вне TelegramModule. InviteLinkDto
// (api/src/users/invite-link.service.ts) собирает `telegramUrl` из него —
// но UsersModule не может импортировать TelegramModule целиком: тот уже
// импортирует UsersModule, второй импорт в обратную сторону закольцевал бы
// граф модулей (ADR-0013). Этот сервис — отдельный лист графа без своих
// зависимостей, его импортируют оба: TelegramBotService пишет сюда при
// прогреве бота (getMe), InviteLinkService читает.
import { Injectable } from '@nestjs/common';

@Injectable()
export class BotIdentityService {
  private username: string | undefined;

  set(username: string | undefined): void {
    this.username = username;
  }

  get(): string | undefined {
    return this.username;
  }
}
