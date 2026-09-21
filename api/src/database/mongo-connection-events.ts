// Аудит 2026-09-21 (HIGH, устойчивость процесса): до этой правки не было ни
// одного слушателя connection.on('disconnected'|'reconnected'|'error') — по
// логам Railway нельзя было понять, сколько раз рвалась связь с Atlas M0 за
// ночь. Чистая функция — тест подписывает обычный EventEmitter вместо
// mongodb-memory-server (CLAUDE.md «Чистая логика»), реальную подписку в
// приложении делает MongoConnectionEventsService.
import type { Logger } from '@nestjs/common';
import { errorMessage, errorStack } from '../common/error-info';

// Минимальный интерфейс вместо mongoose.Connection — тесту достаточно
// EventEmitter, поднимать драйвер настоящей Mongo не нужно.
export interface MongoConnectionLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export function logMongoConnectionEvents(
  connection: MongoConnectionLike,
  logger: Logger,
): void {
  connection.on('connected', () => {
    logger.log('Mongo: соединение установлено');
  });
  // warn, а не log — по этой строке в логах Railway видно, сколько раз за
  // ночь рвалась связь с Atlas M0 (сама причина аудита).
  connection.on('disconnected', () => {
    logger.warn('Mongo: соединение разорвано');
  });
  connection.on('reconnected', () => {
    logger.log('Mongo: соединение восстановлено');
  });
  connection.on('error', (err) => {
    logger.error(`Mongo: ошибка соединения — ${errorMessage(err)}`, errorStack(err));
  });
}
