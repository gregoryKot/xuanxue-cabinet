// Таймауты keep-alive http.Server за прокси Railway (аудит 2026-10-01, F40).
// Node 22 по умолчанию закрывает простаивающее keep-alive соединение через
// 5 с (keepAliveTimeout), а прокси перед сервисом держит соединения к
// апстриму дольше и может отправить следующий запрос ровно в момент, когда
// Node его уже закрывает, — клиент получает 502 ни на чём. Классический
// рецепт: таймаут Node длиннее таймаута прокси (65 с перекрывает и 60 с
// балансировщиков), headersTimeout — чуть больше keepAliveTimeout, иначе
// Node сам срезает соединение по заголовкам раньше. Чистая функция без
// `listen()` — тест без сети (CLAUDE.md «Тесты»).
import type { Server } from 'node:http';

export const KEEP_ALIVE_TIMEOUT_MS = 65_000;
export const HEADERS_TIMEOUT_MS = 66_000;

export type HttpServerTimeouts = Pick<Server, 'keepAliveTimeout' | 'headersTimeout'>;

export function applyHttpServerTimeouts(server: HttpServerTimeouts): void {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
}
