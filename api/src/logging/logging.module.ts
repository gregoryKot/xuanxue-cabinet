// nestjs-pino: JSON-логи в production и test, читаемый pino-pretty только в
// development. Правило CLAUDE.md «Ошибки»: логгер, не console. Подключается
// в app.module.ts, используется через `app.useLogger(app.get(Logger))` +
// `bufferLogs: true` в main.ts (см. api/src/app.setup.ts).
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import { REDACT_PATHS } from './redact-paths';

const HEALTH_PATH = '/api/health';
const REQUEST_ID_HEADER = 'x-request-id';

// Health-запросы шумят на каждый тик Railway/аптайм-монитора — их логировать
// незачем (правило: `/api/health` вне троттлинга и вне автологов запросов).
function isHealthCheck(req: IncomingMessage): boolean {
  return (req.url ?? '').split('?')[0] === HEALTH_PATH;
}

// x-request-id берём из входящего заголовка (сквозная трассировка за
// прокси/балансировщиком), иначе генерируем — и всегда кладём тот же id в
// заголовок ответа, чтобы клиент мог сослаться на него в баг-репорте.
function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

// Вынесено из useFactory как чистая функция — только чтобы её можно было
// протестировать напрямую (правило CLAUDE.md: ветвление — логика, логика
// приезжает с тестом). pino-pretty поднимает воркер-поток форматирования;
// в test/production это лишняя сущность (в e2e — источник «Jest did not
// exit», раз транспорт переживает app.close()), поэтому pretty — только dev.
export function buildPinoHttpOptions(nodeEnv: string, logLevel: string): PinoHttpOptions {
  return {
    level: logLevel,
    genReqId,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    autoLogging: { ignore: isHealthCheck },
    transport:
      nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
        : undefined,
  };
}

export const LoggingModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    pinoHttp: buildPinoHttpOptions(
      config.get<string>('NODE_ENV') ?? 'development',
      config.get<string>('LOG_LEVEL') ?? 'info',
    ),
  }),
});
