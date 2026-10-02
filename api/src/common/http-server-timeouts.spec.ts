import { createServer } from 'node:http';
import {
  applyHttpServerTimeouts,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
} from './http-server-timeouts';

describe('applyHttpServerTimeouts', () => {
  it('keep-alive дольше прокси, заголовки — дольше keep-alive', () => {
    const server = createServer();
    try {
      expect(server.keepAliveTimeout).toBe(5000); // дефолт Node, который ловил 502 за прокси
      applyHttpServerTimeouts(server);
      expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
      expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
      expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
      expect(server.keepAliveTimeout).toBeGreaterThan(60_000);
    } finally {
      server.close();
    }
  });
});
