// Чистая логика с фейками коллабораторов, без Mongo (CLAUDE.md «Тесты»):
// какой экран шлёт renderExamMediaAnswer после привязки видео внутри потока
// вопросов бота.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { renderExamMediaAnswer } from './exam-media-answer';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const VIDEO_Q: AttemptQuestionDto = {
  itemId: 'i1',
  version: 1,
  kind: 'video',
  prompt: 'Покажите форму на видео',
  options: [],
};

function attempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма',
    userId: USER.id,
    status: 'in_progress',
    blocks: [{ id: 'b1', title: '', questions: [VIDEO_Q] }],
    answers: [],
    startedAt: NOW.toISO() ?? '',
    expired: false,
    ...overrides,
  };
}

function fakeCtx(): { ctx: Context; replies: string[]; buttonTexts: string[][] } {
  const replies: string[] = [];
  const buttonTexts: string[][] = [];
  const ctx = {
    reply: (
      text: string,
      extra?: { reply_markup?: { inline_keyboard?: { text: string }[][] } },
    ) => {
      replies.push(text);
      buttonTexts.push(
        (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
      );
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies, buttonTexts };
}

describe('renderExamMediaAnswer', () => {
  it('единственный вопрос — экран с «видео получено» и «Сдать»', async () => {
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(
        attempt({
          media: [
            {
              id: 'm1',
              attemptId: ATTEMPT_ID,
              itemId: VIDEO_Q.itemId,
              kind: 'telegram',
              receivedAt: NOW.toISO() ?? '',
            },
          ],
        }),
      ),
    });
    const botSessions = fakeBotSessionService();
    const { ctx, replies, buttonTexts } = fakeCtx();

    await renderExamMediaAnswer(ctx, port, botSessions, 111, USER, ATTEMPT_ID, 0, NOW);

    expect(replies[0]).toContain('Видео получено.');
    expect(buttonTexts[0]).toContain('Сдать');
  });

  it('есть следующий вопрос — экран этого вопроса', async () => {
    const q2: AttemptQuestionDto = {
      ...VIDEO_Q,
      itemId: 'i2',
      kind: 'single',
      options: [],
    };
    const port = fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(
        attempt({
          blocks: [{ id: 'b1', title: '', questions: [VIDEO_Q, q2] }],
          media: [
            {
              id: 'm1',
              attemptId: ATTEMPT_ID,
              kind: 'telegram',
              receivedAt: NOW.toISO() ?? '',
            },
          ],
        }),
      ),
    });
    const botSessions = fakeBotSessionService();
    const { ctx, replies } = fakeCtx();

    await renderExamMediaAnswer(ctx, port, botSessions, 111, USER, ATTEMPT_ID, 0, NOW);

    expect(replies[0]).toContain('Вопрос 2 из 2');
    // Следующий вопрос single/multiple — ожидание бота закрывается.
    expect(botSessions.clear).toHaveBeenCalledWith(111);
  });

  it('попытка пропала между привязкой и рендером — не падает, ничего не шлёт', async () => {
    const port = fakeExamBotPort({ loadOwnAttempt: jest.fn().mockResolvedValue(null) });
    const botSessions = fakeBotSessionService();
    const { ctx, replies } = fakeCtx();

    await expect(
      renderExamMediaAnswer(ctx, port, botSessions, 111, USER, ATTEMPT_ID, 0, NOW),
    ).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});
