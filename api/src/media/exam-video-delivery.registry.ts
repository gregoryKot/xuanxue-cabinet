// Реестр порта доставки видео экзамена (ADR-0023, уточняет ADR-0095) —
// зеркало exam-bot-port.registry.ts (api/src/telegram/), но в обратную
// сторону: там реестр живёт в telegram/ и его читает exams/, здесь реестр
// живёт в media/ (у потребителя, MediaAssetsService) и в него пишет
// telegram/. MediaModule не может импортировать TelegramModule: тот уже
// импортирует MediaModule ради MediaAssetsService, обратный импорт
// закольцевал бы граф (eslint import-x/no-cycle). Реализация
// (TelegramExamVideoDelivery, telegram/telegram-exam-video-delivery.ts)
// кладёт себя сюда в onModuleInit при подъёме TelegramModule.
//
// Провайдер Nest, а не переменная модуля — тот же довод, что у
// ExamBotPortRegistry (комментарий там же): e2e поднимают по приложению на
// файл, общая переменная процесса протекала бы между ними.
import { Injectable } from '@nestjs/common';
import type { ExamVideoDeliveryPort } from './exam-video-delivery.port';

@Injectable()
export class ExamVideoDeliveryRegistry {
  private port: ExamVideoDeliveryPort | null = null;

  set(port: ExamVideoDeliveryPort): void {
    this.port = port;
  }

  /** `null` бывает только у несобранного приложения: в AppModule MediaModule
   * и TelegramModule поднимаются вместе, все провайдеры строятся раньше, чем
   * учитель нажмёт кнопку «Прислать мне в бота». */
  get(): ExamVideoDeliveryPort {
    if (!this.port) {
      throw new Error(
        'ExamVideoDeliveryPort не зарегистрирован — TelegramModule не поднят.',
      );
    }
    return this.port;
  }
}
