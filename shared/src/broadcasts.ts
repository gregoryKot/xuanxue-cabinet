// DTO и константы API рассылок/доставок (`/broadcasts`, `/deliveries`) —
// разовая рассылка, журнал и отмена (docs/PLAN.md §6 «Рассылки»). Общий
// контракт api и web (CLAUDE.md, раздел «Слои») — по образцу shared/src/lessons.ts.
import type { BroadcastKind, BroadcastStatus, DeliveryStatus } from './domain';

export interface BroadcastDto {
  id: string;
  kind: BroadcastKind;
  status: BroadcastStatus;
  /** Расшифрованный текст — доступ только teacher/admin (весь контроллер,
   * ADR-0010), как и у остальных полей рассылки. */
  text: string;
  scheduledAt: string;
  sentAt?: string;
  lessonId?: string;
  channelIds: string[];
  telegramFileId?: string;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

export interface DeliveryDto {
  id: string;
  broadcastId: string;
  channelId: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt?: string;
  sentAt?: string;
  error?: string;
  externalId?: string;
  /** Текст для копирования — только у ручного канала (`manual`), иначе
   * отсутствует: у telegram/vk его незачем показывать, доставка ушла сама
   * (docs/PLAN.md §6 «Доставка»). */
  text?: string;
}

export interface CreateBroadcastInput {
  text: string;
  channelIds: string[];
  scheduledAt?: string;
  /** UUID v4 от клиента (генерируется на открытие формы, useBroadcastForm.ts):
   * повтор POST с тем же ключом возвращает уже созданную рассылку вместо
   * второй (CLAUDE.md «API» — идемпотентность побочного эффекта). */
  idempotencyKey: string;
}

/** Query `GET /broadcasts` — окно `from..to` обязательно (список без периода
 * — «дай всё», запрещено CLAUDE.md «API»), `status`/`kind` сужают журнал. */
export interface ListBroadcastsQuery {
  from: string;
  to: string;
  status?: BroadcastStatus;
  kind?: BroadcastKind;
  limit?: number;
}

/** Query `GET /deliveries` — «последние проблемы», без окна дат: экран
 * смотрит на текущий статус доставки, не на период (docs/PLAN.md §6). */
export interface ListDeliveriesQuery {
  status?: DeliveryStatus;
  limit?: number;
}

export const BROADCAST_LIMITS = { text: 4096, channelsMax: 20 } as const; // 4096 — лимит Telegram

// UUID v4 (36 символов с дефисами) — типичный вид `crypto.randomUUID()`; до
// 64 на случай другого формата ключа у будущего клиента (бот, ретрай скрипт).
export const IDEMPOTENCY_KEY_LIMITS = { min: 36, max: 64 } as const;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9-]+$/;

/** Шире, чем нужно смотреть в журнале за один запрос: дальше — открывать
 * новое окно, не тянуть всю историю школы разом (CLAUDE.md «API»). */
export const JOURNAL_RANGE_MAX_WEEKS = 8;
