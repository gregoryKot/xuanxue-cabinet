// Чистая логика без Mongo и без DI (CLAUDE.md «Чистая логика») — здесь
// проверяется только сборка объекта опций, само подключение живёт в
// mongoose.forRootAsync и e2e (test/health).
import { MONGO_RUNTIME_ADAPTERS } from './mongo-runtime-adapters';
import {
  mongooseOptions,
  MONGO_CONNECT_RETRY_ATTEMPTS,
  MONGO_CONNECT_RETRY_DELAY_MS,
  MONGO_OPERATION_TIMEOUT_MS,
} from './mongoose-options';

// Копия API_TIMEOUT_MS из web/src/api/http.ts: api → web импортировать нельзя
// (слои, CLAUDE.md), а в shared константа пока не живёт. Разъедутся — тест
// скажет, где.
const WEB_API_TIMEOUT_MS = 30_000;

describe('mongooseOptions', () => {
  it('отдаёт retry-настройки старта — регрессия аудита 2026-09-21: раньше их не было, Nest ронял процесс через 27с', () => {
    const options = mongooseOptions({ uri: 'mongodb://localhost/test', nodeEnv: 'test' });

    expect(options.retryAttempts).toBe(MONGO_CONNECT_RETRY_ATTEMPTS);
    expect(options.retryDelay).toBe(MONGO_CONNECT_RETRY_DELAY_MS);
    // 5 минут ожидания Atlas при старте — согласовано с RUNBOOK §8.3.
    expect(MONGO_CONNECT_RETRY_ATTEMPTS * MONGO_CONNECT_RETRY_DELAY_MS).toBe(
      5 * 60 * 1000,
    );
  });

  // Аудит 2026-10-01, F67: без бюджета операции запрос при паузе Atlas висел
  // дольше клиентских 30 с, и сервер дочитывал запрос, которого никто не ждал.
  it('отдаёт timeoutMS операции драйвера, и он короче таймаута клиента', () => {
    const options = mongooseOptions({ uri: 'mongodb://localhost/test', nodeEnv: 'test' });

    expect(options.timeoutMS).toBe(MONGO_OPERATION_TIMEOUT_MS);
    expect(MONGO_OPERATION_TIMEOUT_MS).toBeLessThan(WEB_API_TIMEOUT_MS);
  });

  it('autoIndex выключен только в production', () => {
    expect(mongooseOptions({ uri: 'mongodb://x', nodeEnv: 'production' }).autoIndex).toBe(
      false,
    );
    expect(
      mongooseOptions({ uri: 'mongodb://x', nodeEnv: 'development' }).autoIndex,
    ).toBe(true);
    expect(mongooseOptions({ uri: 'mongodb://x', nodeEnv: 'test' }).autoIndex).toBe(true);
  });

  it('передаёт uri и runtimeAdapters как есть', () => {
    const options = mongooseOptions({ uri: 'mongodb://x/y', nodeEnv: 'test' });

    expect(options.uri).toBe('mongodb://x/y');
    expect(options.runtimeAdapters).toBe(MONGO_RUNTIME_ADAPTERS);
  });
});
