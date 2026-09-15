// Чистая логика с фейковым BotSessionService, без Mongo (CLAUDE.md «Тесты»):
// какой экран возвращает renderAttemptScreen и какое ожидание при этом
// ставит/закрывает — сама запись в Mongo проверена в bot-session.service.spec.ts.
import { DateTime } from 'luxon';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { renderAttemptScreen } from './exam-question-render';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;

function question(overrides: Partial<AttemptQuestionDto> = {}): AttemptQuestionDto {
  return {
    itemId: 'i1',
    version: 1,
    kind: 'single',
    prompt: 'Вопрос',
    options: [],
    ...overrides,
  };
}

function attempt(
  questions: AttemptQuestionDto[],
  overrides: Partial<ExamAttemptDto> = {},
): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма',
    userId: 'u1',
    status: 'in_progress',
    blocks: [{ id: 'b1', title: '', questions }],
    answers: [],
    startedAt: NOW.toISO() ?? '',
    expired: false,
    ...overrides,
  };
}

describe('renderAttemptScreen', () => {
  it('вопрос text — ставит examText-ожидание с номером вопроса', async () => {
    const botSessions = fakeBotSessionService();
    const view = await renderAttemptScreen(
      botSessions,
      CHAT_ID,
      attempt([question({ kind: 'text' })]),
      0,
      NOW,
    );

    expect(botSessions.startExamTextWait).toHaveBeenCalledWith(
      CHAT_ID,
      ATTEMPT_ID,
      0,
      NOW,
    );
    expect(botSessions.startExamMediaWait).not.toHaveBeenCalled();
    expect(botSessions.clear).not.toHaveBeenCalled();
    expect(view.text).toContain('Напишите ответ сообщением');
  });

  it('вопрос video — ставит examMedia-ожидание с номером вопроса', async () => {
    const botSessions = fakeBotSessionService();
    await renderAttemptScreen(
      botSessions,
      CHAT_ID,
      attempt([question({ kind: 'video' })]),
      0,
      NOW,
    );

    expect(botSessions.startExamMediaWait).toHaveBeenCalledWith(
      CHAT_ID,
      ATTEMPT_ID,
      NOW,
      0,
    );
    expect(botSessions.startExamTextWait).not.toHaveBeenCalled();
  });

  it('вопрос single/multiple — закрывает ожидание, не ставит новое', async () => {
    const botSessions = fakeBotSessionService();
    await renderAttemptScreen(botSessions, CHAT_ID, attempt([question()]), 0, NOW);

    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
    expect(botSessions.startExamTextWait).not.toHaveBeenCalled();
    expect(botSessions.startExamMediaWait).not.toHaveBeenCalled();
  });

  it('попытка не в работе — финальный экран, ожидание закрывается', async () => {
    const botSessions = fakeBotSessionService();
    const view = await renderAttemptScreen(
      botSessions,
      CHAT_ID,
      attempt([question()], { status: 'submitted' }),
      0,
      NOW,
      true,
    );

    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
    expect(view.text).toBe('Работа отправлена. Учитель проверит и пришлёт результат.');
  });

  it('индекс вне снимка (защита в глубину) — ожидание закрывается', async () => {
    const botSessions = fakeBotSessionService();
    await renderAttemptScreen(botSessions, CHAT_ID, attempt([question()]), 5, NOW);

    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
  });
});
