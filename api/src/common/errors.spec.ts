import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from './errors';

describe('доменные ошибки', () => {
  it.each([
    [NotFoundError, 404, 'not_found'],
    [ForbiddenError, 403, 'forbidden'],
    [ConflictError, 409, 'conflict'],
    [InvalidInputError, 400, 'invalid_input'],
    [UnauthorizedError, 401, 'unauthorized'],
  ] as const)('%p: статус %i, код %s', (ErrorClass, status, code) => {
    const err = new ErrorClass('текст для пользователя');
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    expect(err.message).toBe('текст для пользователя');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe(ErrorClass.name);
  });
});
