// Уведомление учителю про исчерпанный повтор доставки (docs/PLAN.md §6,
// CLAUDE.md «Логи»: «сбой доставки после повторов → уведомление учителю в
// Telegram»). Интерфейс отделяет DeliveryRunnerService от способа доставки —
// бот появится отдельным PR и подменит только реализацию, не раннер.
import { Injectable, Logger } from '@nestjs/common';

export interface FailedDeliveryContext {
  deliveryId: string;
  broadcastId: string;
  channelId: string;
  /** Уже без секретов канала — прошла scrubChannelSecrets до notifier. */
  error: string;
}

export interface TeacherNotifier {
  notifyDeliveryFailed(context: FailedDeliveryContext): Promise<void>;
}

export const TEACHER_NOTIFIER = Symbol('TEACHER_NOTIFIER');

/**
 * Заглушка до бота: у DeliveryRunnerService уже есть единственная страховка
 * от тихого отказа — этот error-лог (RUNBOOK §8.1, `requestId` здесь не при
 * чём — тик планировщика, не HTTP-запрос). Настоящая доставка DM учителю —
 * TelegramTeacherNotifier, придёт вместе с ботом и подменит провайдер по
 * токену TEACHER_NOTIFIER, раннер не меняется.
 */
@Injectable()
export class LogTeacherNotifier implements TeacherNotifier {
  private readonly logger = new Logger(LogTeacherNotifier.name);

  notifyDeliveryFailed(context: FailedDeliveryContext): Promise<void> {
    this.logger.error(
      `доставка ${context.deliveryId} (рассылка ${context.broadcastId}, канал ` +
        `${context.channelId}) не отправлена после повторов: ${context.error}`,
    );
    return Promise.resolve();
  }
}
