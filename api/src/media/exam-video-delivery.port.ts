// Порт доставки видео экзамена в Telegram (ADR-0088, уточняет ADR-0023) —
// MediaModule не может импортировать TelegramModule напрямую: тот сам
// импортирует MediaModule (MediaAssetsService), и обратный импорт закольцевал
// бы граф (eslint import-x/no-cycle, CLAUDE.md «Слои»). Интерфейс живёт
// здесь, у того, кто читает — зеркально exam-bot-port.registry.ts
// (api/src/telegram/), где реестр стоит у потребителя внутри telegram/, а не
// у поставщика. Реализация — telegram/telegram-exam-video-delivery.ts, кладёт
// себя в ExamVideoDeliveryRegistry (exam-video-delivery.registry.ts) при
// подъёме TelegramModule: тот уже импортирует MediaModule ради
// MediaAssetsService, реестр ему доступен.
import type { ExamVideoTelegramType } from './media-asset.schema';

export interface SendExamVideoInput {
  chatId: string;
  fileId: string;
  /** Запись со стыка деплоя без сохранённого типа (ADR-0088, тот же приём,
   * что itemId у ADR-0037) — реализация перебирает методы Bot API сама. */
  telegramType?: ExamVideoTelegramType;
  /** Кто, какой экзамен — уходит отдельным сообщением: у video_note подписи
   * не бывает вовсе (единый приём для всех видов вложения, довод — в
   * forward-photo-with-caption.ts). */
  caption: string;
}

export interface ExamVideoDeliveryPort {
  /** Личный чат текущего пользователя с ботом или `null` — нет активного
   * чата (SECURITY §9, ADR-0026/0036: статус `active` и живой канал
   * обязательны). Это действие по кнопке, не рассылка — переключатель
   * уведомлений «Уведомления» здесь не проверяется. */
  resolveChatId(userId: string): Promise<string | null>;
  /** `false` — Telegram не принял отправку (сеть, чат закрыт и т. п.);
   * вызывающий код переводит это в доменную ошибку с понятным текстом
   * (CLAUDE.md «Ошибки»), не в текст исключения. */
  sendVideo(input: SendExamVideoInput): Promise<boolean>;
}
