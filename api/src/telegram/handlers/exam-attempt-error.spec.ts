import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import {
  ATTEMPT_NOT_FOUND_BOT_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
} from '@xuanxue/shared';
import { ConflictError, InvalidInputError, NotFoundError } from '../../common/errors';
import { GENERIC_ERROR } from './callback-actions';
import {
  examUserFacingError,
  presentExamError,
  reportExamActionError,
  sendExamErrorText,
} from './exam-attempt-error';

type Extra = { reply_markup?: { inline_keyboard?: { text: string }[][] } };
type SendMock = jest.Mock<Promise<unknown>, [string, Extra?]>;

function buttonsOf(extra?: Extra): string[] {
  return (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text);
}

function fakeCtx(options: { failEdit?: boolean } = {}): {
  ctx: Context;
  edit: SendMock;
  reply: SendMock;
} {
  const edit: SendMock = options.failEdit
    ? jest
        .fn<Promise<unknown>, [string, Extra?]>()
        .mockRejectedValue(new Error('message is not modified'))
    : jest.fn<Promise<unknown>, [string, Extra?]>().mockResolvedValue(undefined);
  const reply: SendMock = jest
    .fn<Promise<unknown>, [string, Extra?]>()
    .mockResolvedValue(undefined);
  return { ctx: { editMessageText: edit, reply } as unknown as Context, edit, reply };
}

describe('examUserFacingError', () => {
  it('понятный отказ — своим текстом, прочее — общим', () => {
    expect(examUserFacingError(new NotFoundError('Форма не найдена.'))).toBe(
      'Форма не найдена.',
    );
    expect(examUserFacingError(new InvalidInputError('Время вышло.'))).toBe(
      'Время вышло.',
    );
    expect(examUserFacingError(new Error('ECONNRESET'))).toBe(GENERIC_ERROR);
  });

  // Аудит 2026-10-01 (F51): потолок CAS — ConflictError с текстом «отправьте
  // ещё раз» — превращался в «Откройте /menu», ученик думал, что бот сломан.
  it('ConflictError — своим текстом, не общим', () => {
    expect(examUserFacingError(new ConflictError('Отправьте ответ ещё раз.'))).toBe(
      'Отправьте ответ ещё раз.',
    );
  });

  // F51: в Telegram нет страниц — веб-текст «Обновите страницу» подменяется.
  it('ATTEMPT_NOT_FOUND_MESSAGE сервиса — бот-вариант без слова «страницу»', () => {
    const text = examUserFacingError(new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE));
    expect(text).toBe(ATTEMPT_NOT_FOUND_BOT_MESSAGE);
    expect(text).not.toContain('страниц');
  });
});

// F51: ошибка не заменяет экран с кнопками голым текстом — всегда «В меню».
describe('sendExamErrorText / presentExamError', () => {
  it('via edit — редактирует сообщение с кнопкой «В меню»', async () => {
    const { ctx, edit, reply } = fakeCtx();

    await sendExamErrorText(ctx, 'Текст', 'edit');

    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit.mock.calls[0]?.[0]).toBe('Текст');
    expect(buttonsOf(edit.mock.calls[0]?.[1])).toEqual(['В меню']);
    expect(reply).not.toHaveBeenCalled();
  });

  it('via reply — новое сообщение с кнопкой «В меню», текст из ошибки', async () => {
    const { ctx, edit, reply } = fakeCtx();

    await presentExamError(ctx, new InvalidInputError('Время вышло.'), 'reply');

    expect(reply.mock.calls[0]?.[0]).toBe('Время вышло.');
    expect(buttonsOf(reply.mock.calls[0]?.[1])).toEqual(['В меню']);
    expect(edit).not.toHaveBeenCalled();
  });

  it('Telegram не дал отредактировать — не бросает', async () => {
    const { ctx } = fakeCtx({ failEdit: true });

    await expect(sendExamErrorText(ctx, 'Текст', 'edit')).resolves.toBeUndefined();
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

  it('понятный отказ — текст ученику с кнопкой и warn в лог, без стека', async () => {
    const { ctx, edit } = fakeCtx();

    await reportExamActionError(ctx, new InvalidInputError('Время вышло.'), 'answer');

    expect(edit.mock.calls[0]?.[0]).toBe('Время вышло.');
    expect(buttonsOf(edit.mock.calls[0]?.[1])).toEqual(['В меню']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('telegram.exam.answer'));
    expect(error).not.toHaveBeenCalled();
  });

  it('ConflictError — warn, не error: это отказ, а не сбой', async () => {
    const { ctx, edit } = fakeCtx();

    await reportExamActionError(ctx, new ConflictError('Отправьте ещё раз.'), 'answer');

    expect(edit.mock.calls[0]?.[0]).toBe('Отправьте ещё раз.');
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('неизвестный сбой — общий текст ученику и error со стеком в лог', async () => {
    const { ctx, edit } = fakeCtx();

    await reportExamActionError(ctx, new Error('ECONNRESET'), 'navigate');

    expect(edit.mock.calls[0]?.[0]).toBe(GENERIC_ERROR);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('telegram.exam.navigate'),
      expect.stringContaining('ECONNRESET'),
    );
  });

  it('Telegram не дал отредактировать сообщение — не бросает', async () => {
    const { ctx } = fakeCtx({ failEdit: true });

    await expect(
      reportExamActionError(ctx, new NotFoundError('Нет попытки.'), 'answer'),
    ).resolves.toBeUndefined();
  });
});
