// Лента уведомлений кабинета (`GET/POST /me/inbox`) — третье плечо
// ExamNotifier рядом с Telegram и почтой (InAppExamNotifier,
// api/src/notifications/in-app-exam-notifier.ts, ADR-0061). Заголовок
// строки собирается на клиенте из `kind` и ссылок (`examId`/`attemptId`) —
// здесь нет свободного текста: комментарий учителя остаётся в
// `exam_gradings`, где уже зашифрован (exam-grading.ts).
import type { GradingOutcome } from './exam-grading';
import type { NotificationKind } from './notifications';

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  /** Нет у видов уведомления вне экзамена — сейчас лента несёт только
   * attempt_submitted/exam_result, оба всегда со ссылками на форму. */
  examId?: string;
  attemptId?: string;
  /** Только у exam_result — итог проверки (без баллов, PLAN §11 «Границы»). */
  outcome?: GradingOutcome;
  /** Нет — непрочитано. Есть — когда отметили (POST .../read). */
  readAt?: string; // ISO UTC с Z
  createdAt: string; // ISO UTC с Z
}

export interface ListInboxQuery {
  limit?: number;
}

export interface InboxPageDto {
  items: NotificationDto[];
  /** Не `items.filter(...).length` — своя выборка по всей ленте человека,
   * не только по странице лимита (бейдж колокольчика не должен занижать
   * счётчик, когда непрочитанных больше limit). */
  unreadCount: number;
}

export const INBOX_ITEM_NOT_FOUND_MESSAGE = 'Уведомление не найдено. Обновите страницу.';
