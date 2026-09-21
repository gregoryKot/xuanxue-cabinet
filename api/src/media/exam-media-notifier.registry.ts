// Реестр порта уведомления о ссылке (exam-media-notifier.port.ts) — тот же
// приём инверсии, что ExamBotPortRegistry (telegram/exam-bot-port.registry.ts,
// комментарий там же — почему провайдер Nest, а не `let` на уровне модуля:
// тесты поднимают по приложению на файл, общая переменная процесса протекала
// бы между ними).
//
// В отличие от ExamBotPortRegistry.get() — здесь `getOrNull()`, не бросающий:
// уведомление об успешно сохранённой ссылке — best-effort (CLAUDE.md
// «Ошибки»), несобранный нотификатор не должен ронять сам POST
// /attempts/:id/media/link. ExamBotPortRegistry.get() бросает потому, что у
// бота порт нужен для самого ответа пользователю; здесь порт нужен только
// побочному эффекту после того, как ответ уже готов.
import { Injectable } from '@nestjs/common';
import type { ExamMediaNotifier } from './exam-media-notifier.port';

@Injectable()
export class ExamMediaNotifierRegistry {
  private notifier: ExamMediaNotifier | null = null;

  set(notifier: ExamMediaNotifier): void {
    this.notifier = notifier;
  }

  /** `null` — ExamsModule (где живёт реализация) ещё не поднят или его нет в
   * собранном приложении (тест media/ без exams/). Вызывающий код
   * (MediaAssetsService.addLink) обязан пережить `null` молча. */
  getOrNull(): ExamMediaNotifier | null {
    return this.notifier;
  }
}
