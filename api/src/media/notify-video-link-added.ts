// Уведомление о присланной ссылке (ADR-0084) — вынесено из
// MediaAssetsService.addLink (файл-лимит CLAUDE.md «Храповики»): владение,
// проверка itemId и сама запись ссылки остаются в сервисе, здесь только
// сборка контекста (формулировка вопроса — media-item-lookup.ts) и best-effort
// вызов реестра (exam-media-notifier.registry.ts).
//
// Не ждём осмысленного результата (CLAUDE.md «Ошибки»): HTTP-ответ ученику
// не должен ни падать, ни задерживаться из-за бота или ленты кабинета.
// Несобранный нотификатор (ExamsModule не поднят — тест media/ без exams/)
// — молча, это не ошибка, см. ExamMediaNotifierRegistry.getOrNull.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type { ExamMediaNotifierRegistry } from './exam-media-notifier.registry';
import { videoQuestionPromptInSnapshot } from './media-item-lookup';
import type { AttemptOwnerInfo } from './media-attempt-owner';

const logger = new Logger('media.notifyVideoLinkAdded');

export function notifyVideoLinkAdded(
  registry: ExamMediaNotifierRegistry,
  attemptId: string,
  owner: AttemptOwnerInfo,
  userId: string,
  itemId: string | undefined,
  url: string,
  now: DateTime,
): void {
  const notifier = registry.getOrNull();
  if (!notifier) return;
  notifier
    .notifyVideoLinkAdded(
      {
        attemptId,
        examId: owner.examId,
        examTitle: owner.examTitle,
        userId,
        questionPrompt: videoQuestionPromptInSnapshot(owner.blocks, itemId),
        url,
      },
      now,
    )
    .catch((err) => {
      // Без PII (CLAUDE.md «Логи») — ни ссылка, ни имя ученика в лог не идут,
      // только ключи для поиска.
      logger.warn(`не доставлено: ${errorMessage(err)}`, {
        attemptId,
        examId: owner.examId,
      });
    });
}
