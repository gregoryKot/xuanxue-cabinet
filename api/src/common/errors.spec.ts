import {
  AmbiguousCredentialsError,
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  SelectionLimitError,
  UnauthorizedError,
  UnsupportedMediaTypeError,
} from './errors';

describe('доменные ошибки', () => {
  it.each([
    [NotFoundError, 404, 'not_found'],
    [ForbiddenError, 403, 'forbidden'],
    [ConflictError, 409, 'conflict'],
    [InvalidInputError, 400, 'invalid_input'],
    [UnauthorizedError, 401, 'unauthorized'],
    [AmbiguousCredentialsError, 400, 'ambiguous_credentials'],
    [SelectionLimitError, 409, 'selection_limit'],
    [UnsupportedMediaTypeError, 415, 'unsupported_media_type'],
  ] as const)('%p: статус %i, код %s', (ErrorClass, status, code) => {
    const err = new ErrorClass('текст для пользователя');
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    expect(err.message).toBe('текст для пользователя');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe(ErrorClass.name);
  });
});
