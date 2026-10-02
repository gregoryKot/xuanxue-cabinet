// Юнит на чистый маппер без Nest-хоста (CLAUDE.md «Чистая логика»); поведение
// через фильтр целиком — domain-exception.filter.spec.ts (тот на потолке
// файла-храповика).
import { BadRequestException, ForbiddenException, ParseIntPipe } from '@nestjs/common';
import { fromHttpException } from './http-exception.mapper';

const VALIDATION_MESSAGE = 'Проверьте, пожалуйста, введённые данные.';

describe('fromHttpException', () => {
  // Аудит 2026-10-01, F46: английский текст ParseIntPipe уходил ученику как
  // есть на PUT /answer-videos/:id/parts/:n.
  it('400 со строкой (ParseIntPipe) — общий русский текст, не английский', async () => {
    const pipe = new ParseIntPipe();
    const exception = await pipe
      .transform('abc', { type: 'param', data: 'n' })
      .then(() => {
        throw new Error('ParseIntPipe обязан отклонить abc');
      })
      .catch((err: unknown) => err);
    expect(exception).toBeInstanceOf(BadRequestException);

    const body = fromHttpException(exception as BadRequestException, 'req-1');

    expect(body).toEqual({
      statusCode: 400,
      code: 'invalid_input',
      message: VALIDATION_MESSAGE,
      requestId: 'req-1',
    });
  });

  it('400 с массивом (ValidationPipe) — общий текст и details', () => {
    const body = fromHttpException(new BadRequestException(['title обязателен']));

    expect(body.message).toBe(VALIDATION_MESSAGE);
    expect(body.details).toEqual(['title обязателен']);
  });

  it('не-400 со своей строкой — текст уходит как есть', () => {
    const body = fromHttpException(new ForbiddenException('Нет доступа к занятию'));

    expect(body).toMatchObject({ statusCode: 403, message: 'Нет доступа к занятию' });
  });
});
