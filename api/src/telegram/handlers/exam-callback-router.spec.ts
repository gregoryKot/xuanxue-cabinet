// Фейковый ExamBotPort и фейковый UsersService, без Mongo и без сети
// (CLAUDE.md «Тесты»): маршрутизация exam/eq/eo/es к нужному хендлеру,
// незнакомец — тихо игнорируется.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { UserLean, UsersService } from '../../users/users.service';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { buildOptionId, buildQuestionId } from './exam-callback-ids';
import { isExamCallbackAction, routeExamCallback } from './exam-callback-router';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function attempt(): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма',
    userId: USER.id,
    status: 'in_progress',
    blocks: [
      {
        id: 'b1',
        title: '',
        required: true,
        questions: [
          {
            itemId: 'i1',
            version: 1,
            kind: 'single',
            prompt: 'Вопрос 1',
            options: [{ id: 'o1', text: 'A' }],
          },
        ],
      },
    ],
    answers: [],
    startedAt: NOW.toISO() ?? '',
    expired: false,
  };
}

function fakeCtx(): { ctx: Context; edits: string[] } {
  const edits: string[] = [];
  const ctx = {
    editMessageText: (text: string) => Promise.resolve(Boolean(edits.push(text))),
  } as unknown as Context;
  return { ctx, edits };
}

function fakeUsers(user: UserLean | null): UsersService {
  return {
    findByTelegramId: jest.fn().mockResolvedValue(user),
  } as unknown as UsersService;
}

describe('isExamCallbackAction', () => {
  it('exam/eq/eo/es — да, прочие — нет', () => {
    expect(isExamCallbackAction('exam')).toBe(true);
    expect(isExamCallbackAction('eq')).toBe(true);
    expect(isExamCallbackAction('eo')).toBe(true);
    expect(isExamCallbackAction('es')).toBe(true);
    expect(isExamCallbackAction('notif')).toBe(false);
    expect(isExamCallbackAction('menu')).toBe(false);
  });
});

describe('routeExamCallback', () => {
  it('незнакомец (нет записи в users) — тихо игнорируется, порт не зовётся', async () => {
    const port = fakeExamBotPort();
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(ctx, 'exam', 'e1', 111, fakeUsers(null), port, NOW);

    expect(port.startAttempt).not.toHaveBeenCalled();
    expect(edits).toEqual([]);
  });

  it('exam — зовёт handleExamStart через порт', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(ctx, 'exam', 'e1', 111, fakeUsers(USER), port, NOW);

    expect(port.startAttempt).toHaveBeenCalledWith('e1', USER, NOW);
    expect(edits[0]).toContain('Вопрос 1 из 1');
  });

  it('es — зовёт handleExamSubmit через порт', async () => {
    const port = fakeExamBotPort({
      submitAttempt: jest.fn().mockResolvedValue({ ...attempt(), status: 'submitted' }),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(ctx, 'es', ATTEMPT_ID, 111, fakeUsers(USER), port, NOW);

    expect(port.submitAttempt).toHaveBeenCalledWith(ATTEMPT_ID, USER, NOW);
    expect(edits).toEqual(['Работа отправлена. Учитель проверит и пришлёт результат.']);
  });

  it('eq с валидным составным id — зовёт handleExamQuestion', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(
      ctx,
      'eq',
      buildQuestionId(ATTEMPT_ID, 0),
      111,
      fakeUsers(USER),
      port,
      NOW,
    );

    expect(port.loadOwnAttempt).toHaveBeenCalledWith(ATTEMPT_ID, USER, NOW);
    expect(edits[0]).toContain('Вопрос 1 из 1');
  });

  it('eo с валидным составным id — зовёт handleExamOption', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(attempt()),
      saveAnswer: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx } = fakeCtx();

    await routeExamCallback(
      ctx,
      'eo',
      buildOptionId(ATTEMPT_ID, 0, 0),
      111,
      fakeUsers(USER),
      port,
      NOW,
    );

    expect(port.saveAnswer).toHaveBeenCalledWith(
      ATTEMPT_ID,
      USER,
      { itemId: 'i1', optionIds: ['o1'] },
      NOW,
    );
  });

  it('eq/eo с битым составным id — тихо игнорируется', async () => {
    const port = fakeExamBotPort();
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(ctx, 'eq', 'не-id:0', 111, fakeUsers(USER), port, NOW);

    expect(port.loadOwnAttempt).not.toHaveBeenCalled();
    expect(edits).toEqual([]);
  });
});
