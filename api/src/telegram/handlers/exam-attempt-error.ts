// Текст ошибки пользователю для действий экзамена в боте — отдельно от
// callback-actions.ts::userFacingError: там NotFoundError|ConflictError
// (рассылки, доставки), здесь NotFoundError|InvalidInputError — все тексты
// экзамена уже написаны по VOICE в самом сервисе (EXAM_NOT_PUBLISHED_MESSAGE,
// ATTEMPT_EXPIRED_MESSAGE, attemptsExceededMessage и т.д., shared/src/exams.ts,
// api/src/exams/attempts-exceeded-message.ts) — их и показываем как есть.
import { InvalidInputError, NotFoundError } from '../../common/errors';
import { GENERIC_ERROR } from './callback-actions';

export function examUserFacingError(err: unknown): string {
  return err instanceof NotFoundError || err instanceof InvalidInputError
    ? err.message
    : GENERIC_ERROR;
}
