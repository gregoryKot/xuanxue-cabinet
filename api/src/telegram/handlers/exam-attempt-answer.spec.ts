// Фейковый ExamBotPort, без Mongo и без сети (CLAUDE.md «Тесты»): выбор
// варианта (single/multiple, автосохранение) и «Сдать».
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  type AttemptQuestionDto,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { GENERIC_ERROR } from './callback-actions';
import { handleExamOption, handleExamSubmit } from './exam-attempt-answer';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

function attempt(
  questions: AttemptQuestionDto[],
  overrides: Partial<ExamAttemptDto> = {},
): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма',
    userId: USER.id,
    status: 'in_progress',
    blocks: [{ id: 'b1', title: '', questions }],
    answers: [],
    startedAt: NOW.toISO() ?? '',
    expired: false,
    ...overrides,
  };
}

const SINGLE_Q: AttemptQuestionDto = {
  itemId: 'i1',
  version: 1,
  kind: 'single',
  prompt: 'Вопрос 1',
  options: [
    { id: 'o1', text: 'Верно' },
    { id: 'o2', text: 'Неверно' },
  ],
};

const MULTIPLE_Q: AttemptQuestionDto = {
  itemId: 'i1',
  version: 1,
  kind: 'multiple',
  prompt: 'Вопрос 1',
  options: [
    { id: 'o1', text: 'A' },
    { id: 'o2', text: 'B' },
  ],
};

function fakeCtx(options: { failEdit?: boolean } = {}): {
  ctx: Context;
  edits: string[];
  buttonTexts: string[][];
  replies: string[];
  deletes: number[];
  sendPhoto: jest.Mock;
} {
  const edits: string[] = [];
  const buttonTexts: string[][] = [];
  const replies: string[] = [];
  const deletes: number[] = [];
  // Самый большой размер последним (ADR-0035) — exam-question-album-send.ts
  // берёт file_id именно оттуда.
  const sendPhoto = jest.fn().mockResolvedValue({
    message_id: 1,
    photo: [{ file_id: 'f-small' }, { file_id: 'f-big' }],
  });
  const ctx = {
    editMessageText: (
      text: string,
      extra?: { reply_markup?: { inline_keyboard?: { text: string }[][] } },
    ) => {
      if (options.failEdit) return Promise.reject(new Error('сообщение недоступно'));
      edits.push(text);
      buttonTexts.push(
        (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
      );
      return Promise.resolve(true);
    },
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve();
    },
    deleteMessage: () => {
      deletes.push(1);
      return Promise.resolve(true);
    },
    telegram: { sendPhoto },
  } as unknown as Context;
  return { ctx, edits, buttonTexts, replies, deletes, sendPhoto };
}

describe('handleExamOption', () => {
  it('single, единственный вопрос — сохраняет и остаётся на нём (виден «Сдать»)', async () => {
    const current = attempt([SINGLE_Q]);
    const saved = attempt([SINGLE_Q], { answers: [{ itemId: 'i1', optionIds: ['o1'] }] });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const { ctx, buttonTexts } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(port.saveAnswer).toHaveBeenCalledWith(
      ATTEMPT_ID,
      USER,
      { itemId: 'i1', optionIds: ['o1'] },
      NOW,
    );
    expect(buttonTexts[0]).toContain('✓ Верно');
  });

  it('single, есть следующий вопрос — автоматически переходит к нему', async () => {
    const q2: AttemptQuestionDto = { ...SINGLE_Q, itemId: 'i2', prompt: 'Вопрос 2' };
    const current = attempt([SINGLE_Q, q2]);
    const saved = attempt([SINGLE_Q, q2], {
      answers: [{ itemId: 'i1', optionIds: ['o1'] }],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(edits[0]).toContain('Вопрос 2 из 2');
  });

  it('single, следующий вопрос — с картинкой у варианта — альбом до экрана, старое сообщение удалено (ADR-0035)', async () => {
    const q2: AttemptQuestionDto = {
      itemId: 'i2',
      version: 1,
      kind: 'single',
      prompt: 'Вопрос 2',
      options: [{ id: 'p1', text: 'Стойка А', imageId: 'img-1' }],
    };
    const current = attempt([SINGLE_Q, q2]);
    const saved = attempt([SINGLE_Q, q2], {
      answers: [{ itemId: 'i1', optionIds: ['o1'] }],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
      loadOptionImage: jest
        .fn()
        .mockResolvedValue({ bytes: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' }),
    });
    const { ctx, edits, replies, deletes, sendPhoto } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(deletes).toHaveLength(1);
    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(edits).toHaveLength(0); // не правка старого — новое сообщение
    expect(replies).toEqual([expect.stringContaining('Вопрос 2 из 2')]);
  });

  it('single, следующий вопрос — text — ставит examText-ожидание под него', async () => {
    const textQ: AttemptQuestionDto = {
      itemId: 'i2',
      version: 1,
      kind: 'text',
      prompt: 'Опишите форму словами',
      options: [],
    };
    const current = attempt([SINGLE_Q, textQ]);
    const saved = attempt([SINGLE_Q, textQ], {
      answers: [{ itemId: 'i1', optionIds: ['o1'] }],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const botSessions = fakeBotSessionService();
    const { ctx } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      botSessions,
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(botSessions.startExamTextWait).toHaveBeenCalledWith(
      CHAT_ID,
      ATTEMPT_ID,
      1,
      NOW,
    );
  });

  it('multiple — переключает вариант и остаётся на том же вопросе', async () => {
    const current = attempt([MULTIPLE_Q], {
      answers: [{ itemId: 'i1', optionIds: ['o1'] }],
    });
    const saved = attempt([MULTIPLE_Q], {
      answers: [{ itemId: 'i1', optionIds: ['o1', 'o2'] }],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const { ctx, edits, buttonTexts } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 1 },
      NOW,
    );

    expect(port.saveAnswer).toHaveBeenCalledWith(
      ATTEMPT_ID,
      USER,
      { itemId: 'i1', optionIds: ['o1', 'o2'] },
      NOW,
    );
    expect(edits[0]).toContain('Вопрос 1 из 1');
    expect(buttonTexts[0]).toContain('☑ B');
  });

  it('multiple с картинкой у варианта — переключение не повторяет альбом, тот же вопрос (ADR-0035)', async () => {
    const imagedMultiple: AttemptQuestionDto = {
      ...MULTIPLE_Q,
      options: [
        { id: 'o1', text: 'A', imageId: 'img-1' },
        { id: 'o2', text: 'B' },
      ],
    };
    const current = attempt([imagedMultiple], {
      answers: [{ itemId: 'i1', optionIds: ['o1'] }],
    });
    const saved = attempt([imagedMultiple], {
      answers: [{ itemId: 'i1', optionIds: ['o1', 'o2'] }],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const { ctx, edits, deletes, sendPhoto } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 1 },
      NOW,
    );

    expect(sendPhoto).not.toHaveBeenCalled();
    expect(deletes).toHaveLength(0);
    expect(edits).toHaveLength(1); // тот же вопрос — просто editMessageText
    expect(port.loadOptionImage).not.toHaveBeenCalled();
  });

  it('multiple — повторное нажатие снимает отметку', async () => {
    const current = attempt([MULTIPLE_Q], {
      answers: [{ itemId: 'i1', optionIds: ['o1', 'o2'] }],
    });
    const saved = attempt([MULTIPLE_Q], {
      answers: [{ itemId: 'i1', optionIds: ['o2'] }],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const { ctx } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(port.saveAnswer).toHaveBeenCalledWith(
      ATTEMPT_ID,
      USER,
      { itemId: 'i1', optionIds: ['o2'] },
      NOW,
    );
  });

  it('чужая/несуществующая попытка — ATTEMPT_NOT_FOUND_MESSAGE', async () => {
    const port = fakeExamBotPort({ loadOwnAttempt: jest.fn().mockResolvedValue(null) });
    const { ctx, edits } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(edits).toEqual([ATTEMPT_NOT_FOUND_MESSAGE]);
    expect(port.saveAnswer).not.toHaveBeenCalled();
  });

  it('попытка уже не в работе — финальный экран, ответ не отправляется', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest
        .fn()
        .mockResolvedValue(attempt([SINGLE_Q], { status: 'submitted' })),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    expect(port.saveAnswer).not.toHaveBeenCalled();
    expect(edits).toHaveLength(1);
  });

  it('устаревший/подделанный индекс варианта — общий текст, не падает', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(attempt([SINGLE_Q])),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamOption(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 9 },
      NOW,
    );

    expect(edits).toEqual([GENERIC_ERROR]);
    expect(port.saveAnswer).not.toHaveBeenCalled();
  });

  it('сервис отказал (например, дедлайн истёк между чтением и сохранением) — текст сервиса', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(attempt([SINGLE_Q])),
      saveAnswer: jest.fn().mockRejectedValue(new Error('время вышло')),
    });
    const { ctx, edits } = fakeCtx();

    await expect(
      handleExamOption(
        ctx,
        port,
        fakeBotSessionService(),
        USER,
        CHAT_ID,
        { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(edits).toEqual([GENERIC_ERROR]);
  });

  it('сообщение недоступно (удалено/бот выкинут) — не падает', async () => {
    const current = attempt([SINGLE_Q]);
    const saved = attempt([SINGLE_Q], { answers: [{ itemId: 'i1', optionIds: ['o1'] }] });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(current),
      saveAnswer: jest.fn().mockResolvedValue(saved),
    });
    const { ctx } = fakeCtx({ failEdit: true });

    await expect(
      handleExamOption(
        ctx,
        port,
        fakeBotSessionService(),
        USER,
        CHAT_ID,
        { attemptId: ATTEMPT_ID, questionIndex: 0, optionIndex: 0 },
        NOW,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('handleExamSubmit', () => {
  it('успешная отправка — экран «Работа отправлена»', async () => {
    const port = fakeExamBotPort({
      submitAttempt: jest
        .fn()
        .mockResolvedValue(attempt([SINGLE_Q], { status: 'submitted' })),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamSubmit(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      ATTEMPT_ID,
      NOW,
    );

    expect(port.submitAttempt).toHaveBeenCalledWith(ATTEMPT_ID, USER, NOW);
    expect(edits).toEqual(['Работа отправлена. Учитель проверит и пришлёт результат.']);
  });

  it('сервис отказал — текст сервиса, не исключение наружу', async () => {
    const port = fakeExamBotPort({
      submitAttempt: jest.fn().mockRejectedValue(new Error('попытка не найдена')),
    });
    const { ctx, edits } = fakeCtx();

    await expect(
      handleExamSubmit(
        ctx,
        port,
        fakeBotSessionService(),
        USER,
        CHAT_ID,
        ATTEMPT_ID,
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(edits).toEqual([GENERIC_ERROR]);
  });
});
