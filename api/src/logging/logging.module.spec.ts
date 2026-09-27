import pino from 'pino';
import { buildPinoHttpOptions, renameReservedLogKeys } from './logging.module';
import { redactRequestSerializer } from './request-serializer';

describe('buildPinoHttpOptions', () => {
  it('development: включает pino-pretty', () => {
    const options = buildPinoHttpOptions('development', 'debug');
    expect(options.transport).toMatchObject({ target: 'pino-pretty' });
    expect(options.level).toBe('debug');
  });

  it('production: без транспорта — чистый JSON в stdout', () => {
    const options = buildPinoHttpOptions('production', 'info');
    expect(options.transport).toBeUndefined();
  });

  it('test: без транспорта — pino-pretty поднимает воркер-поток, лишний в e2e', () => {
    const options = buildPinoHttpOptions('test', 'info');
    expect(options.transport).toBeUndefined();
  });

  it('autoLogging.ignore отфильтровывает только /api/health', () => {
    const options = buildPinoHttpOptions('production', 'info');
    const ignore = (options.autoLogging as { ignore: (req: { url: string }) => boolean })
      .ignore;
    expect(ignore({ url: '/api/health' })).toBe(true);
    expect(ignore({ url: '/api/health?x=1' })).toBe(true);
    expect(ignore({ url: '/api/classes' })).toBe(false);
  });

  // Поведение самого редактирования url — в request-serializer.spec.ts;
  // здесь только проверка, что buildPinoHttpOptions его подключает и не даёт
  // pino-http обернуть ещё раз (см. комментарий у wrapSerializers в module).
  it('подключает redactRequestSerializer и выключает повторную обёртку pino-http', () => {
    const options = buildPinoHttpOptions('production', 'info');
    expect(options.serializers?.req).toBe(redactRequestSerializer);
    expect(options.wrapSerializers).toBe(false);
  });
});

// Регрессия: 23–26.09.2026 четыре алёрта «Сбой в браузере» (requestId
// 5addec59-d6aa-4440-a9c1-5aa06ba469aa, ed7b3bac-37bb-4114-be54-1964153aaa3d,
// 9e47b860-f5a5-4dd9-a06b-42da4c3a51e3, 9a5ef539-9911-465a-981f-8dc85796187f)
// пришли без текста: поле `message` Railway затёр текстом строки, а
// `level: 50` показал как INFO. Строка проверяется так, как её пишет pino.
describe('строка лога в разборе Railway', () => {
  function writeLine(
    fields: Record<string, unknown>,
    msg: string,
  ): Record<string, unknown> {
    const { formatters } = buildPinoHttpOptions('production', 'info');
    const lines: string[] = [];
    const logger = pino({ formatters }, { write: (line: string) => lines.push(line) });
    logger.error(fields, msg);
    return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  }

  it('уровень — словом, его понимает фильтр @level:error', () => {
    expect(writeLine({}, 'x').level).toBe('error');
  });

  it('поле message не теряется — переезжает в detail, msg остаётся текстом строки', () => {
    const line = writeLine(
      { requestId: 'r', message: 'TypeError: x is undefined' },
      'Сбой',
    );
    expect(line).not.toHaveProperty('message');
    expect(line.detail).toBe('TypeError: x is undefined');
    expect(line.msg).toBe('Сбой');
    expect(line.requestId).toBe('r');
  });

  it('объект без message не трогается', () => {
    const fields = { requestId: 'r' };
    expect(renameReservedLogKeys(fields)).toBe(fields);
  });
});
