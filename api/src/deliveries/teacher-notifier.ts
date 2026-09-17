// Уведомление учителю про исчерпанный повтор доставки и про сбой шага
// планировщика (docs/PLAN.md §6, CLAUDE.md «Логи»: «сбой доставки после
// повторов → уведомление учителю в Telegram; ошибки планировщика → DM
// админу»). Интерфейс отделяет DeliveryRunnerService/SchedulerService от
// способа доставки — реализация (TelegramTeacherNotifier, api/src/telegram/)
// шлёт сообщение в личный чат учителя/админа, лог остаётся её собственным
// fallback-путём, если писать некому (нет ни одного чата в PersonalChats).
import type { DateTime } from 'luxon';

export interface FailedDeliveryContext {
  deliveryId: string;
  broadcastId: string;
  channelId: string;
  /** Уже без секретов канала — прошла scrubChannelSecrets до notifier. */
  error: string;
}

export interface CancelledBroadcastContext {
  broadcastId: string;
  /** Не используется для резолва имени (broadcastId уже даёт занятие+класс),
   * но входит в контекст для симметрии с FailedDeliveryContext.deliveryId. */
  lessonId?: string;
  /** Причина из broadcast.text (insertCancelledPlaceholder,
   * broadcast.inserts.ts) — например CANCEL_REASON.noChannels
   * (broadcast-cancel-reasons.ts). */
  reason: string;
}

export interface TeacherNotifier {
  /** `now` — параметром (CLAUDE.md «Время»): вызывающий код (раннер) уже
   * держит момент тика, реализация не имеет права звать DateTime.utc() сама. */
  notifyDeliveryFailed(context: FailedDeliveryContext, now: DateTime): Promise<void>;

  /** Сбой шага тика планировщика (SchedulerService.step) — `step` — русское
   * имя шага из лога ('занятия'/'рассылки'/'доставки'/'предпросмотр'/…). */
  notifySchedulerFailed(step: string, error: string, now: DateTime): Promise<void>;

  /** Планировщик или рассылка записи сами отменили рассылку — тихий отказ
   * (CLAUDE.md «Логи»), учитель должен узнать и понять, что сделать
   * (docs/PLAN.md §6 «Планировщик»). По причине, которую не сформулировать
   * действием (класс выключен — решение самого учителя; данные-аномалии),
   * реализация ничего не шлёт. */
  notifyBroadcastCancelled(
    context: CancelledBroadcastContext,
    now: DateTime,
  ): Promise<void>;
}

export const TEACHER_NOTIFIER = Symbol('TEACHER_NOTIFIER');
