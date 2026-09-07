import { describe, expect, it } from 'vitest';
import { distributeTemplateServerError } from './templateServerError';

describe('distributeTemplateServerError', () => {
  it('ключ шаблона в message — уходит под свой редактор, замена на подпись', () => {
    const result = distributeTemplateServerError({
      message: 'В шаблоне «lesson_link» неизвестные подстановки: {дата}.',
    });

    expect(result.byKind.lesson_link).toBe(
      'В шаблоне «Анонс занятия» неизвестные подстановки: {дата}.',
    );
    expect(result.byKind.recording).toBeUndefined();
    expect(result.general).toBeNull();
  });

  it('ключ recording — тоже уходит под свой редактор', () => {
    const result = distributeTemplateServerError({
      message: 'В шаблоне «recording» неизвестные подстановки: {дата}.',
    });

    expect(result.byKind.recording).toBe(
      'В шаблоне «Пост с записью» неизвестные подстановки: {дата}.',
    );
  });

  it('без узнаваемого ключа — общая ошибка под формой, byKind пуст', () => {
    const error = { message: 'Что-то пошло не так. Попробуйте ещё раз через минуту.' };
    const result = distributeTemplateServerError(error);

    expect(result.byKind).toEqual({});
    expect(result.general).toBe(error);
  });

  it('details без узнаваемого ключа остаются в общей ошибке как есть', () => {
    const error = {
      message: 'Проверьте, пожалуйста, введённые данные.',
      details: ['Шаблон не может быть пустым.'],
    };
    const result = distributeTemplateServerError(error);

    expect(result.general).toEqual(error);
  });
});
