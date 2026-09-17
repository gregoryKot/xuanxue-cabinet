// Реестр порта к сервисам экзаменов (слой 4б.2, ADR-0024). Бот — второй
// клиент ExamAttemptsService/MyExamsService, но `api/src/telegram` не может
// импортировать `api/src/exams` напрямую: ExamsModule уже импортирует
// TelegramModule ради EXAM_NOTIFIER, и обратный импорт закольцевал бы граф
// (eslint import-x/no-cycle). Поэтому направление инверсировано: интерфейс
// живёт здесь, реализация (ExamBotService, exams/) кладёт себя сюда при
// подъёме своего модуля.
//
// Именно провайдер Nest, а не `let` на уровне модуля: тесты поднимают по
// приложению на файл (api/test/e2e-support/create-app.ts), и общая
// переменная процесса протекала бы между ними — второе приложение
// перезаписало бы порт первому. У провайдера состояние живёт ровно столько,
// сколько живёт приложение, которому он принадлежит.
import { Injectable } from '@nestjs/common';
import type { ExamBotPort } from './exam-bot.port';

@Injectable()
export class ExamBotPortRegistry {
  private port: ExamBotPort | null = null;

  set(port: ExamBotPort): void {
    this.port = port;
  }

  /** `null` бывает только у несобранного приложения: в AppModule
   * ExamsModule и TelegramModule поднимаются вместе, а все провайдеры
   * строятся раньше, чем бот получит первый апдейт. */
  get(): ExamBotPort {
    if (!this.port) {
      throw new Error('ExamBotPort не зарегистрирован — ExamsModule не поднят.');
    }
    return this.port;
  }
}
