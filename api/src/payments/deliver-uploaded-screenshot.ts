// Вызов порта доставки снимка бухгалтеру после успешной загрузки из кабинета
// (ADR-0156) — вынесен из payment-screenshots.service.ts (файл-лимит
// CLAUDE.md). Ученик уже сохранил снимок, и его ответ от доставки не зависит:
// пустой реестр или бросивший порт (по контракту не бросает — здесь защита в
// глубину) остаются `error` с ключом для поиска в логах, без имени ученика и
// ссылок (SECURITY §1), а не 500 после записи.
import type { Logger } from '@nestjs/common';
import { errorMessage, errorStack } from '../common/error-info';
import type { UploadedScreenshotDelivery } from './payment-screenshot-delivery.port';
import type { PaymentScreenshotDeliveryRegistry } from './payment-screenshot-delivery.registry';

export async function deliverUploadedScreenshot(
  registry: PaymentScreenshotDeliveryRegistry,
  logger: Logger,
  input: UploadedScreenshotDelivery,
): Promise<void> {
  const key = { userId: input.studentUserId, month: input.month };
  const port = registry.getOrNull();
  if (!port) {
    logger.error('payments.screenshot.deliver: порт доставки не собран', key);
    return;
  }
  try {
    await port.deliverUploaded(input);
  } catch (err) {
    logger.error(`payments.screenshot.deliver: ${errorMessage(err)}`, errorStack(err));
  }
}
