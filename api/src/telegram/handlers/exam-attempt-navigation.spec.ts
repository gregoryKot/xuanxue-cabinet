// Фейковый ExamBotPort, без Mongo и без сети (CLAUDE.md «Тесты», образец —
// соседние спеки хендлеров бота): «Начать»/«Продолжить» и переход между
// вопросами.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_NOT_FOUND_MESSAGE,
  EXAM_NOT_PUBLISHED_MESSAGE,
  type ExamAttemptDto,
  type MyExamDto,
} from '@xuanxue/shared';
import { InvalidInputError } from '../../common/errors';
import type { UserLean } from '../../users/users.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { GENERIC_ERROR } from './callback-actions';
import {
  handleExamQuestion,
  handleExamStart,
  handleExamStartConfirm,
} from './exam-attempt-navigation';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
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

function exam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма третьего уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

function fakeCtx(options: { failEdit?: boolean } = {}): {
  ctx: Context;
  edits: string[];
  replies: string[];
  deletes: number[];
  sendPhoto: jest.Mock;
} {
  const edits: string[] = [];
  const replies: string[] = [];
  const deletes: number[] = [];
  // Фото — как их реально отдаёт Telegram (ADR-0035): самый большой размер
  // последним, exam-question-album-send.ts берёт file_id именно оттуда.
  const sendPhoto = jest.fn().mockResolvedValue({
    message_id: 1,
    photo: [{ file_id: 'f-small' }, { file_id: 'f-big' }],
  });
  const ctx = {
    editMessageText: (text: string) =>
      options.failEdit
        ? Promise.reject(new Error('сообщение недоступно'))
        : Promise.resolve(Boolean(edits.push(text))),
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
  return { ctx, edits, replies, deletes, sendPhoto };
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

  it('первый вопрос с картинкой у варианта — старое сообщение удалено, альбом до экрана, экран reply (ADR-0035)', async () => {
    const withImage = attempt({
      blocks: [
        {
          id: 'b1',
          title: 'Теория',
          questions: [
            {
              itemId: 'i1',
              version: 1,
              kind: 'single',
              prompt: 'Какая стойка на фото?',
              options: [{ id: 'o1', text: 'Стойка А', imageId: 'img-1' }],
            },
          ],
        },
      ],
    });
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockResolvedValue(withImage),
      loadOptionImage: jest
        .fn()
        .mockResolvedValue({ bytes: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' }),
    });
    const { ctx, edits, replies, deletes, sendPhoto } = fakeCtx();

    await handleExamStart(ctx, port, fakeBotSessionService(), USER, CHAT_ID, 'e1', NOW);

    expect(deletes).toHaveLength(1);
    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(edits).toHaveLength(0); // экран НЕ редактирует старое сообщение
    expect(replies).toEqual([expect.stringContaining('Какая стойка на фото?')]);
  });
});

// ADR-0121, отзыв владельца 2026-09-22: вопрос «Вы начинаете экзамен» перед
// стартом попытки с лимитом времени.
describe('handleExamStartConfirm', () => {
  it('лимит есть, попытки не было — экран подтверждения, старт ещё не зовётся', async () => {
    const port = fakeExamBotPort({
      listMyExams: jest.fn().mockResolvedValue([exam({ timeLimitMin: 45 })]),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamStartConfirm(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      'e1',
      NOW,
    );

    expect(port.startAttempt).not.toHaveBeenCalled();
    expect(edits[0]).toContain('Вы начинаете экзамен');
    expect(edits[0]).toContain('45 минут');
  });

  it('лимита нет — защита в глубину, сразу старт, без вопроса', async () => {
    const port = fakeExamBotPort({
      listMyExams: jest.fn().mockResolvedValue([exam()]),
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamStartConfirm(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      'e1',
      NOW,
    );

    expect(port.startAttempt).toHaveBeenCalledWith('e1', USER, NOW);
    expect(edits[0]).toContain('Вопрос 1 из 1');
  });

  it('действие «continue» (попытка уже идёт) — защита в глубину, сразу старт', async () => {
    const port = fakeExamBotPort({
      listMyExams: jest.fn().mockResolvedValue([
        exam({
          timeLimitMin: 45,
          lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
        }),
      ]),
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await handleExamStartConfirm(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      'e1',
      NOW,
    );

    expect(port.startAttempt).toHaveBeenCalledWith('e1', USER, NOW);
    expect(edits[0]).toContain('Вопрос 1 из 1');
  });

  it('форма не найдена в свежем списке — EXAM_NOT_FOUND_MESSAGE, callback data не пробрасывается на веру', async () => {
    const port = fakeExamBotPort({ listMyExams: jest.fn().mockResolvedValue([]) });
    const { ctx, edits } = fakeCtx();

    await handleExamStartConfirm(
      ctx,
      port,
      fakeBotSessionService(),
      USER,
      CHAT_ID,
      'e1',
      NOW,
    );

    expect(edits).toEqual([EXAM_NOT_FOUND_MESSAGE]);
    expect(port.startAttempt).not.toHaveBeenCalled();
  });

  it('сервис отказал — общий текст, не исключение наружу', async () => {
    const port = fakeExamBotPort({
      listMyExams: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const { ctx, edits } = fakeCtx();

    await expect(
      handleExamStartConfirm(
        ctx,
        port,
        fakeBotSessionService(),
        USER,
        CHAT_ID,
        'e1',
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(edits).toEqual([GENERIC_ERROR]);
  });
});

describe('handleExamQuestion', () => {
  it('переход к вопросу — рендерит экран этого индекса', async () => {
    const twoQuestions = attempt({
      blocks: [
        {
          id: 'b1',
          title: 'Теория',
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
