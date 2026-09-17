import { buildPinoHttpOptions } from './logging.module';
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
