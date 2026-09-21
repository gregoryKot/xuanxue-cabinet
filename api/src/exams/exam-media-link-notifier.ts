// Реализация ExamMediaNotifier (media/exam-media-notifier.port.ts, ADR-0084)
// поверх кабинета и Telegram — тот же приём инверсии, что ExamBotService у
// ExamBotPortRegistry (exam-bot.service.ts): кладёт себя в
// ExamMediaNotifierRegistry при подъёме модуля, потому что media/ не может
// импортировать exams/ напрямую (комментарий в exam-media-notifier.port.ts).
//
// Оба плеча — тем же приёмом, что CompositeExamNotifier (exam-notifier.composite.ts):
// `Promise.allSettled`, чтобы упавшее плечо (например, Telegram недоступен)
// не погасило второе (кабинет). В отличие от CompositeExamNotifier результат
// каждого плеча не нужен вызывающему — InAppVideoLinkNotifier/TelegramVideoLinkNotifier
// уже отчитываются о себе сами (Logger.warn/error, без PII), здесь только
// логируем упавший промис, если он всё же исключение, а не их собственный
// catch.
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type {
  ExamMediaNotifier,
  VideoLinkAddedContext,
} from '../media/exam-media-notifier.port';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import { InAppVideoLinkNotifier } from '../notifications/in-app-video-link-notifier';
import { TelegramVideoLinkNotifier } from '../telegram/telegram-video-link-notifier';

@Injectable()
export class ExamMediaLinkNotifier implements ExamMediaNotifier, OnModuleInit {
  private readonly logger = new Logger(ExamMediaLinkNotifier.name);

  constructor(
    private readonly inApp: InAppVideoLinkNotifier,
    private readonly telegram: TelegramVideoLinkNotifier,
    private readonly registry: ExamMediaNotifierRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.set(this);
  }

  async notifyVideoLinkAdded(
    context: VideoLinkAddedContext,
    now: DateTime,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.inApp.notifyVideoLinkAdded(context, now),
      this.telegram.notifyVideoLinkAdded(context, now),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        // Оба плеча сами ловят свои сбои (Logger.warn/error) — сюда попадает
        // только исключение мимо их собственного catch. Без PII (CLAUDE.md
        // «Логи»): ни ссылка, ни имя ученика.
        this.logger.warn(`exam.notifyVideoLinkAdded: ${errorMessage(result.reason)}`, {
          attemptId: context.attemptId,
          examId: context.examId,
        });
      }
    }
  }
}
