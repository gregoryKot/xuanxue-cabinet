// Fire-and-forget вызов ExamMediaNotifierPort.notifyLinkAttached (ADR-0084 —
// ссылка теперь основной путь ответа на видео-вопрос, CLAUDE.md «Тихий отказ
// — самая дорогая ошибка в продукте про рассылки»). Вынесено из
// MediaAssetsService.addLink (файл-лимит CLAUDE.md «Храповики»), тем же
// приёмом, что notifyAttemptSubmitted (api/src/exams/notify-attempt-submitted.ts):
// HTTP-ответ ученику не ждёт Telegram — сбой (в т.ч. реестр без
// зарегистрированной реализации, exam-media-notifier.port.ts) ловится и
// уходит в Logger.warn, наружу не пробрасывается.
//
// Зовёт только addLink: addManual — учитель отмечает вручную сам, слать ему
// уведомление о собственной отметке незачем; attachTelegramVideo уже
// пересылает видео учителю сама (forwardExamVideoToTeachers,
// telegram/handlers/exam-media-forward.ts) — дублировать не нужно.
//
// Замена ссылки (ADR-0086, upsertLinkMediaAsset) идёт тем же путём и тоже
// уведомляет: учитель, у которого в чате лежит прежний адрес, иначе открыл
// бы старую запись и не узнал, что ученик её поправил.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type {
  ExamMediaNotifierRegistry,
  LinkAttachedContext,
} from './exam-media-notifier.port';
import type { AttemptOwnerInfo } from './media-attempt-owner';
import { findQuestionInSnapshot } from './media-item-lookup';

const logger = new Logger('notifyLinkAttached');

export function notifyLinkAttached(
  registry: ExamMediaNotifierRegistry,
  attemptId: string,
  owner: AttemptOwnerInfo,
  url: string,
  itemId: string | undefined,
  now: DateTime,
): void {
  const port = registry.get();
  if (!port) return; // бот не поднят — легитимно, см. exam-media-notifier.port.ts

  const found = itemId ? findQuestionInSnapshot(owner.blocks, itemId) : null;
  const context: LinkAttachedContext = {
    attemptId,
    userId: owner.userId,
    examTitle: owner.examTitle,
    url,
    question: found ? { order: found.order, prompt: found.question.prompt } : undefined,
  };
  port.notifyLinkAttached(context, now).catch((err: unknown) => {
    logger.warn(`media.notifyLinkAttached: ${errorMessage(err)}`, { attemptId });
  });
}
