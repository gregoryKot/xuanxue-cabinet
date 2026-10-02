import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import { InvalidInputError, NotFoundError } from '../../common/errors';
import { GENERIC_ERROR } from './callback-actions';
import { examUserFacingError, reportExamActionError } from './exam-attempt-error';

function fakeCtx(): { ctx: Context; edit: jest.Mock } {
  const edit = jest.fn().mockResolvedValue(undefined);
  return { ctx: { editMessageText: edit } as unknown as Context, edit };
}

describe('examUserFacingError', () => {
  it('понятный отказ — своим текстом, прочее — общим', () => {
    expect(examUserFacingError(new NotFoundError('Попытка не найдена.'))).toBe(
      'Попытка не найдена.',
    );
    expect(examUserFacingError(new InvalidInputError('Время вышло.'))).toBe(
      'Время вышло.',
    );
    expect(examUserFacingError(new Error('ECONNRESET'))).toBe(GENERIC_ERROR);
  });
});

// Аудит 2026-10-01 (F35): пять catch в боте глотали ошибку без следа.
describe('reportExamActionError', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('понятный отказ — текст ученику и warn в лог, без стека', async () => {
    const { ctx, edit } = fakeCtx();

    await reportExamActionError(ctx, new InvalidInputError('Время вышло.'), 'answer');

    expect(edit).toHaveBeenCalledWith('Время вышло.');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('telegram.exam.answer'));
    expect(error).not.toHaveBeenCalled();
  });

  it('неизвестный сбой — общий текст ученику и error со стеком в лог', async () => {
    const { ctx, edit } = fakeCtx();

    await reportExamActionError(ctx, new Error('ECONNRESET'), 'navigate');

    expect(edit).toHaveBeenCalledWith(GENERIC_ERROR);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('telegram.exam.navigate'),
      expect.stringContaining('ECONNRESET'),
    );
  });

  it('Telegram не дал отредактировать сообщение — не бросает', async () => {
    const edit = jest.fn().mockRejectedValue(new Error('message is not modified'));
    const ctx = { editMessageText: edit } as unknown as Context;

    await expect(
      reportExamActionError(ctx, new NotFoundError('Нет попытки.'), 'answer'),
    ).resolves.toBeUndefined();
  });
});
