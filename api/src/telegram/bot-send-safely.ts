// Обёртка try/catch вокруг проактивной отправки вне ответа на апдейт
// (предпросмотр, «Запись?», ручные каналы, уведомления об ошибках, видео
// экзамена — ADR-0095) — вынесена из telegram-bot.service.ts (файл-лимит
// CLAUDE.md «Храповики»): используют sendMessage и sendExamVideo. Без бота —
// молча ничего не делает; сбой сети — warn в лог с chatId полем, не текстом
// строки (SECURITY §1 п.2, §4), не наружу: тик планировщика не должен падать
// из-за упавшей отправки.
//
// Возвращает `true`/`false` вместо прежнего `void` (аудит 2026-09, находка
// 2): раньше сбой был виден только этому warn, вызывающий код не мог его
// отличить от успеха — TelegramExamNotifier ловил свой `try/catch` вокруг
// сбоев резолва чата/имени, но не вокруг самой отправки, и она молча
// считалась успешной. Существующие вызовы (recording-prompt,
// manual-prompt, preview.service, teacher-notifier) результат по-прежнему
// не читают — их поведение не меняется, они как слали best-effort, так и
// шлют; новые (TelegramExamNotifier, exam-media-forward.ts) проверяют его,
// чтобы эскалировать тотальный сбой отдельным `error`, а не тем же `warn`.
import type { Logger } from '@nestjs/common';
import type { Telegraf } from 'telegraf';
import { errorMessage } from '../common/error-info';

export async function sendBotActionSafely(
  bot: Telegraf | null,
  logger: Logger,
  chatId: string,
  method: string,
  action: (bot: Telegraf) => Promise<void>,
): Promise<boolean> {
  if (!bot) return false;
  try {
    await action(bot);
    return true;
  } catch (err) {
    logger.warn({ chatId }, `telegram.${method}: ${errorMessage(err)}`);
    return false;
  }
}
