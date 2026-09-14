// Фейковый ExamBotPort, без Mongo и без сети (CLAUDE.md «Тесты», образец —
// соседние спеки хендлеров бота): «Начать»/«Продолжить» и переход между
// вопросами.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_NOT_PUBLISHED_MESSAGE,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import { InvalidInputError } from '../../common/errors';
import type { UserLean } from '../../users/users.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { GENERIC_ERROR } from './callback-actions';
import { handleExamQuestion, handleExamStart } from './exam-attempt-navigation';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function attempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма третьего уровня',
    userId: USER.id,
    status: 'in_progress',
    blocks: [
      {
        id: 'b1',
        title: 'Теория',
        required: true,
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Вопрос 1',
            options: [{ id: 'o1', text: 'Ответ' }],
          },
        ],
      },
    ],
    answers: [],
    startedAt: NOW.toISO() ?? '',
    expired: false,
    ...overrides,
  };
}

function fakeCtx(options: { failEdit?: boolean } = {}): {
  ctx: Context;
  edits: string[];
} {
  const edits: string[] = [];
  const ctx = {
    editMessageText: (text: string) =>
      options.failEdit
        ? Promise.reject(new Error('сообщение недоступно'))
        : Promise.resolve(Boolean(edits.push(text))),
  } as unknown as Context;
  return { ctx, edits };
}

describe('handleExamStart', () => {
  it('успешный старт — экран первого вопроса', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamStart(ctx, port, fakeBotSessionService(), USER, CHAT_ID, 'e1', NOW);

    expect(port.startAttempt).toHaveBeenCalledWith('e1', USER, NOW);
    expect(edits[0]).toContain('Вопрос 1 из 1');
  });

  it('форма не опубликована — текст сервиса, не общий', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest
        .fn()
        .mockRejectedValue(new InvalidInputError(EXAM_NOT_PUBLISHED_MESSAGE)),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamStart(ctx, port, fakeBotSessionService(), USER, CHAT_ID, 'e1', NOW);

    expect(edits).toEqual([EXAM_NOT_PUBLISHED_MESSAGE]);
  });

  it('неизвестная ошибка — общий текст, не исключение наружу', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const { ctx, edits } = fakeCtx();

    await expect(
      handleExamStart(ctx, port, fakeBotSessionService(), USER, CHAT_ID, 'e1', NOW),
    ).resolves.toBeUndefined();
    expect(edits).toEqual([GENERIC_ERROR]);
  });

  it('попытка сразу просрочена — экран «время вышло», не вопрос', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest
        .fn()
        .mockResolvedValue(attempt({ status: 'submitted', expired: true })),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamStart(ctx, port, fakeBotSessionService(), USER, CHAT_ID, 'e1', NOW);

    expect(edits).toEqual([ATTEMPT_EXPIRED_MESSAGE]);
  });

  it('сообщение недоступно (удалено/бот выкинут) — не падает', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx } = fakeCtx({ failEdit: true });

    await expect(
      handleExamStart(ctx, port, fakeBotSessionService(), USER, CHAT_ID, 'e1', NOW),
    ).resolves.toBeUndefined();
  });
});

describe('handleExamQuestion', () => {
  it('переход к вопросу — рендерит экран этого индекса', async () => {
    const twoQuestions = attempt({
      blocks: [
        {
          id: 'b1',
          title: 'Теория',
          required: true,
          questions: [
            { itemId: 'i1', version: 1, kind: 'single', prompt: 'Вопрос 1', options: [] },
            { itemId: 'i2', version: 1, kind: 'single', prompt: 'Вопрос 2', options: [] },
          ],
        },
      ],
    });
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(twoQuestions),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamQuestion(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, index: 1 },
      NOW,
    );

    expect(port.loadOwnAttempt).toHaveBeenCalledWith(ATTEMPT_ID, USER, NOW);
    expect(edits[0]).toContain('Вопрос 2 из 2');
  });

  it('чужая/несуществующая попытка — ATTEMPT_NOT_FOUND_MESSAGE, не подтверждаем её', async () => {
    const port = fakeExamBotPort({ loadOwnAttempt: jest.fn().mockResolvedValue(null) });
    const { ctx, edits } = fakeCtx();

    await handleExamQuestion(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      { attemptId: ATTEMPT_ID, index: 0 },
      NOW,
    );

    expect(edits).toEqual([ATTEMPT_NOT_FOUND_MESSAGE]);
  });

  it('сервис отказал — общий текст, не исключение наружу', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const { ctx, edits } = fakeCtx();

    await expect(
      handleExamQuestion(
        ctx,
        port,
        fakeBotSessionService(),
        USER,
        CHAT_ID,
        { attemptId: ATTEMPT_ID, index: 0 },
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(edits).toEqual([GENERIC_ERROR]);
  });
});
