import { buildPinoHttpOptions } from './logging.module';

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
});
