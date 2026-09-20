// Юнит-тест без Mongo — ExamBotPort и BotSessionService фейковые (CLAUDE.md
// «Тесты»): сама механика (Mongo, шифрование) — дело
// exam-gradings.service.spec.ts/grade-attempt-flow.spec.ts.
import { DateTime } from 'luxon';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { BotSessionService } from '../bot-session.service';
import { saveGradingAndReply } from './grade-comment-save';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const GRADER = {
  id: 'g1',
  name: 'Дима',
  roles: ['teacher' as const],
  status: 'active' as const,
};

function fakeBotSessions(): { clear: jest.Mock } {
  return { clear: jest.fn().mockResolvedValue(undefined) };
}

describe('saveGradingAndReply', () => {
  it('успех — закрывает ожидание и шлёт итог с меткой outcome', async () => {
    const examBot = fakeExamBotPort({
      gradeAttempt: jest.fn().mockResolvedValue({
        id: 'grading1',
        attemptId: ATTEMPT_ID,
        examId: 'e1',
        userId: 'u1',
        graderId: GRADER.id,
        outcome: 'passed',
        gradedAt: NOW.toISO(),
      }),
    });
    const botSessions = fakeBotSessions();
    const reply = jest.fn().mockResolvedValue(undefined);

    await saveGradingAndReply(
      examBot,
      botSessions as unknown as BotSessionService,
      111,
      ATTEMPT_ID,
      'passed',
      'Хорошо',
      GRADER,
      NOW,
      reply,
    );

    expect(examBot.gradeAttempt).toHaveBeenCalledWith(
      ATTEMPT_ID,
      GRADER.id,
      { outcome: 'passed', comment: 'Хорошо' },
      NOW,
    );
    expect(botSessions.clear).toHaveBeenCalledWith(111);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Зачёт'));
  });

  it('попытка исчезла (null) — закрывает ожидание, честный текст', async () => {
    const examBot = fakeExamBotPort({ gradeAttempt: jest.fn().mockResolvedValue(null) });
    const botSessions = fakeBotSessions();
    const reply = jest.fn().mockResolvedValue(undefined);

    await saveGradingAndReply(
      examBot,
      botSessions as unknown as BotSessionService,
      111,
      ATTEMPT_ID,
      'passed',
      undefined,
      GRADER,
      NOW,
      reply,
    );

    expect(botSessions.clear).toHaveBeenCalledWith(111);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('не найдена'));
  });

  it('сбой gradeAttempt — ожидание НЕ закрывается (до TTL), фраза в чат', async () => {
    const examBot = fakeExamBotPort({
      gradeAttempt: jest.fn().mockRejectedValue(new Error('mongo упал')),
    });
    const botSessions = fakeBotSessions();
    const reply = jest.fn().mockResolvedValue(undefined);

    await saveGradingAndReply(
      examBot,
      botSessions as unknown as BotSessionService,
      111,
      ATTEMPT_ID,
      'passed',
      undefined,
      GRADER,
      NOW,
      reply,
    );

    expect(botSessions.clear).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
  });
});
