// Чистая логика с фейковым BotSessionService, без Mongo (CLAUDE.md «Тесты»):
// какой экран возвращает renderAttemptScreen (включая альбом картинок
// вариантов, ADR-0037) и какое ожидание при этом ставит/закрывает — сама
// запись в Mongo проверена в bot-session.service.spec.ts. presentAttemptScreen
// — фейковый ctx и ExamBotPort, без Telegram: сама отправка альбома со всеми
// её деталями (file_id, повтор, сбой) — exam-question-album.spec.ts.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { presentAttemptScreen, renderAttemptScreen } from './exam-question-render';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

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
    expect(view.album).toEqual([]); // у text/video вариантов не бывает
  });

  it('вопрос single с картинкой у варианта — альбом собран (ADR-0037)', async () => {
    const botSessions = fakeBotSessionService();
    const view = await renderAttemptScreen(
      botSessions,
      CHAT_ID,
      attempt([
        question({
          options: [
            { id: 'o1', text: 'Стойка А', imageId: 'img-1' },
            { id: 'o2', text: 'Стойка Б' },
          ],
        }),
      ]),
      0,
      NOW,
    );

    expect(view.album).toEqual([
      { imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1: Стойка А' },
    ]);
  });

  it('вопрос video — ставит examMedia-ожидание с номером вопроса и itemId', async () => {
    const botSessions = fakeBotSessionService();
    await renderAttemptScreen(
      botSessions,
      CHAT_ID,
      attempt([question({ kind: 'video', itemId: 'video-1' })]),
      0,
      NOW,
    );

    // itemId — из самого вопроса (ADR-0037), не угадывается по индексу.
    expect(botSessions.startExamMediaWait).toHaveBeenCalledWith(
      CHAT_ID,
      ATTEMPT_ID,
      NOW,
      0,
      'video-1',
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
    expect(view.album).toEqual([]); // финальный экран — без альбома
  });

  it('индекс вне снимка (защита в глубину) — ожидание закрывается', async () => {
    const botSessions = fakeBotSessionService();
    await renderAttemptScreen(botSessions, CHAT_ID, attempt([question()]), 5, NOW);

    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
  });
});

function fakeCtx(): {
  ctx: Context;
  edits: string[];
  replies: string[];
  deletes: number[];
} {
  const edits: string[] = [];
  const replies: string[] = [];
  const deletes: number[] = [];
  const ctx = {
    editMessageText: (text: string) => {
      edits.push(text);
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
    telegram: {
      sendPhoto: () => Promise.resolve({ message_id: 1, photo: [{ file_id: 'f' }] }),
    },
  } as unknown as Context;
  return { ctx, edits, replies, deletes };
}

const ALBUM = [{ imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' }];
const VIEW_WITH_ALBUM = { text: 'Текст', buttons: [], album: ALBUM };
const VIEW_NO_ALBUM = { text: 'Текст', buttons: [], album: [] };

describe('presentAttemptScreen', () => {
  function deps() {
    return {
      examBot: fakeExamBotPort(),
      user: USER,
      chatId: CHAT_ID,
      attemptId: ATTEMPT_ID,
    };
  }

  it('без альбома (view.album пуст) — просто editMessageText, ничего не удаляет', async () => {
    const { ctx, edits, deletes, replies } = fakeCtx();

    await presentAttemptScreen(ctx, deps(), VIEW_NO_ALBUM, {
      via: 'edit',
      withAlbum: true,
    });

    expect(edits).toEqual(['Текст']);
    expect(deletes).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });

  it('withAlbum: false — просто editMessageText, альбом не шлётся (переключение варианта)', async () => {
    const { ctx, edits, deletes } = fakeCtx();
    const port = fakeExamBotPort();

    await presentAttemptScreen(ctx, { ...deps(), examBot: port }, VIEW_WITH_ALBUM, {
      via: 'edit',
      withAlbum: false,
    });

    expect(edits).toEqual(['Текст']);
    expect(deletes).toHaveLength(0);
    expect(port.loadOptionImage).not.toHaveBeenCalled();
  });

  it('via: edit, альбом есть — старое сообщение удаляется, экран уходит reply, не edit', async () => {
    const { ctx, edits, deletes, replies } = fakeCtx();

    await presentAttemptScreen(ctx, deps(), VIEW_WITH_ALBUM, {
      via: 'edit',
      withAlbum: true,
    });

    expect(deletes).toHaveLength(1);
    expect(edits).toHaveLength(0);
    expect(replies).toEqual(['Текст']);
  });

  it('via: reply, альбом есть — экран уходит reply, ничего не удаляется', async () => {
    const { ctx, deletes, replies } = fakeCtx();

    await presentAttemptScreen(ctx, deps(), VIEW_WITH_ALBUM, {
      via: 'reply',
      withAlbum: true,
    });

    expect(deletes).toHaveLength(0);
    expect(replies).toEqual(['Текст']);
  });
});
