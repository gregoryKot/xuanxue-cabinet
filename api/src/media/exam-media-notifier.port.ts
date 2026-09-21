// Порт уведомления Telegram о привязанной ссылке на видео-ответ (ADR-0084 —
// ссылка теперь основной путь ответа на видео-вопрос, ADR-0086, CLAUDE.md
// «Тихий отказ — самая дорогая ошибка»). MediaModule не может импортировать
// TelegramModule напрямую — TelegramModule уже импортирует MediaModule
// (media.module.ts, ExamMediaMessageHandler слоя 4.5), обратный импорт
// закольцевал бы граф (eslint import-x/no-cycle). Решение — тот же приём,
// что ExamBotPortRegistry (api/src/telegram/exam-bot-port.registry.ts):
// интерфейс и реестр живут на стороне потребителя (здесь), реализация лежит
// в api/src/telegram/ (TelegramExamMediaNotifier) и кладёт себя в реестр
// сама, при подъёме TelegramModule.
//
// Отличие от ExamBotPortRegistry.get(): там `null` — программная ошибка
// (ExamsModule не поднят вместе с TelegramModule, такого не бывает в
// собранном приложении). Здесь `null` — обычный случай: бот может не
// подняться вовсе (нет TELEGRAM_BOT_TOKEN — тесты, окружение без бота), а
// POST /media/link обязан отработать и тогда — ссылка сохраняется независимо
// от того, поднят бот или нет. Поэтому get() возвращает `null`, не бросает.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';

/** Вопрос, к которому относится ссылка — есть только если addLink получил
 * itemId и нашёл его в снимке попытки (findQuestionInSnapshot,
 * media-item-lookup.ts). `order` — номер по сквозному порядку, как «Вопрос N
 * из M» на экране бота (flattenAttemptQuestions, exam-question-screen.ts). */
export interface LinkAttachedQuestion {
  order: number;
  prompt: string;
}

/** Данные для уведомления учителя/помощника о привязанной ссылке —
 * MediaAssetsService.addLink собирает их из уже прочитанного снимка попытки
 * (loadAttemptOwnerInfo), второго похода в базу не делает. Имени ученика
 * здесь нет, только userId — тем же приёмом, что AttemptSubmittedContext
 * (exams/exam-notifier.ts): имя резолвит сама реализация (у неё уже есть
 * UsersService через UsersModule), MediaModule такой зависимости не заводит
 * ради одной строки текста. */
export interface LinkAttachedContext {
  attemptId: string;
  userId: string;
  examTitle: string;
  url: string;
  question?: LinkAttachedQuestion;
}

export interface ExamMediaNotifierPort {
  notifyLinkAttached(context: LinkAttachedContext, now: DateTime): Promise<void>;
}

@Injectable()
export class ExamMediaNotifierRegistry {
  private port: ExamMediaNotifierPort | null = null;

  set(port: ExamMediaNotifierPort): void {
    this.port = port;
  }

  /** `null` — легитимный случай, не программная ошибка (см. шапку файла). */
  get(): ExamMediaNotifierPort | null {
    return this.port;
  }
}
