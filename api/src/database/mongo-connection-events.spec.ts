// EventEmitter вместо реального mongoose.Connection (CLAUDE.md «Чистая
// логика») — проверяем, какой лог на каком событии, а не факт подписки.
// Спай на Logger.prototype — как в normalize-user-status.spec.ts, spy в
// переменную вместо прямой ссылки на `logger.warn` (eslint unbound-method).
import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { logMongoConnectionEvents } from './mongo-connection-events';

describe('logMongoConnectionEvents', () => {
  let connection: EventEmitter;
  let logger: Logger;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    connection = new EventEmitter();
    logger = new Logger('test');
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logMongoConnectionEvents(connection, logger);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('connected логируется как log', () => {
    connection.emit('connected');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('установлено'));
  });

  it('disconnected логируется как warn — по этой строке считают разрывы за ночь', () => {
    connection.emit('disconnected');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('разорвано'));
  });

  it('reconnected логируется как log', () => {
    connection.emit('reconnected');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('восстановлено'));
  });

  it('error логируется со стеком через errorMessage/errorStack', () => {
    const err = new Error('boom');

    connection.emit('error', err);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom'), err.stack);
  });

  it('error без Error-объекта логируется без стека', () => {
    connection.emit('error', 'boom');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom'), undefined);
  });
});
