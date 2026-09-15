// Фейковый ExamBotPort и фейковый BotUserAccessService, без Mongo и без сети
// (CLAUDE.md «Тесты»): маршрутизация exam/eq/eo/es к нужному хендлеру,
// незнакомец — тихо игнорируется, blocked/invited — отказ (SECURITY §9,
// ADR-0026).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  ACCESS_MESSAGE,
  PENDING_APPROVAL_MESSAGE,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { fakeBotSessionService } from '../bot-session.service.test-support';
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

    await routeExamCallback(
      ctx,
      'exam',
      'e1',
      111,
      fakeBotUserAccess({ kind: 'unknown' }),
      port,
      fakeBotSessionService(),
      NOW,
    );

    expect(port.startAttempt).not.toHaveBeenCalled();
    expect(edits).toEqual([]);
  });

  it('exam — зовёт handleExamStart через порт', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(
      ctx,
      'exam',
      'e1',
      111,
      fakeBotUserAccess(activeAccess(USER)),
      port,
      fakeBotSessionService(),
      NOW,
    );

    expect(port.startAttempt).toHaveBeenCalledWith('e1', USER, NOW);
    expect(edits[0]).toContain('Вопрос 1 из 1');
  });

  it('es — зовёт handleExamSubmit через порт', async () => {
    const port = fakeExamBotPort({
      submitAttempt: jest.fn().mockResolvedValue({ ...attempt(), status: 'submitted' }),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(
      ctx,
      'es',
      ATTEMPT_ID,
      111,
      fakeBotUserAccess(activeAccess(USER)),
      port,
      fakeBotSessionService(),
      NOW,
    );

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
      fakeBotUserAccess(activeAccess(USER)),
      port,
      fakeBotSessionService(),
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
      fakeBotUserAccess(activeAccess(USER)),
      port,
      fakeBotSessionService(),
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

    await routeExamCallback(
      ctx,
      'eq',
      'не-id:0',
      111,
      fakeBotUserAccess(activeAccess(USER)),
      port,
      fakeBotSessionService(),
      NOW,
    );

    expect(port.loadOwnAttempt).not.toHaveBeenCalled();
    expect(edits).toEqual([]);
  });

  it('заблокированный — отказ тем же текстом, что в вебе, порт не зовётся', async () => {
    const port = fakeExamBotPort({
      startAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(
      ctx,
      'exam',
      'e1',
      111,
      fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
      port,
      fakeBotSessionService(),
      NOW,
    );

    expect(port.startAttempt).not.toHaveBeenCalled();
    expect(edits).toEqual([ACCESS_MESSAGE]);
  });

  it('неподтверждённый (invited) — отказ ожиданием подтверждения, порт не зовётся', async () => {
    const port = fakeExamBotPort({
      saveAnswer: jest.fn().mockResolvedValue(attempt()),
      loadOwnAttempt: jest.fn().mockResolvedValue(attempt()),
    });
    const { ctx, edits } = fakeCtx();

    await routeExamCallback(
      ctx,
      'eo',
      buildOptionId(ATTEMPT_ID, 0, 0),
      111,
      fakeBotUserAccess({ kind: 'denied', message: PENDING_APPROVAL_MESSAGE }),
      port,
      fakeBotSessionService(),
      NOW,
    );

    expect(port.loadOwnAttempt).not.toHaveBeenCalled();
    expect(port.saveAnswer).not.toHaveBeenCalled();
    expect(edits).toEqual([PENDING_APPROVAL_MESSAGE]);
  });
});
