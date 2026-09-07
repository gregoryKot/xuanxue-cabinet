// DTO и константы API рассылок/доставок (`/broadcasts`, `/deliveries`).
// Общий контракт api и web (CLAUDE.md, раздел «Слои») — по образцу
// shared/src/lessons.ts. Список и журнал (docs/PLAN.md §6 «Рассылки») —
// следующий PR, здесь только разовая рассылка и ручная доставка.
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
}

export const BROADCAST_LIMITS = { text: 4096, channelsMax: 20 } as const; // 4096 — лимит Telegram
