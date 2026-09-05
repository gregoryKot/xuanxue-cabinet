// Доменные ошибки: сервисы бросают их вместо HttpException (правило
// CLAUDE.md «Ошибки») — бизнес-логика не знает про HTTP-статусы, их
// сопоставление живёт в одном месте (domain-exception.filter.ts).
import type { ApiErrorCode } from '@xuanxue/shared';

export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  readonly status = 404;
}

export class ForbiddenError extends DomainError {
  readonly code = 'forbidden';
  readonly status = 403;
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';
  readonly status = 409;
}

export class InvalidInputError extends DomainError {
  readonly code = 'invalid_input';
  readonly status = 400;
}
