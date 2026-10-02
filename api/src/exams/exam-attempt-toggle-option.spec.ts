// Аудит 2026-10-01 (F27): переключение варианта `multiple` считается внутри
// CAS-цикла по перечитанным ответам. Чистая функция — без Mongo; гонка двух
// параллельных нажатий — против настоящей Mongo (mongodb-memory-server, не
// мок — CLAUDE.md «Тесты»): это запрос, и мок его не проверил бы.
import { DateTime } from 'luxon';
import {
  AUTHOR_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { toggleOptionAnswer } from './exam-attempt-toggle-option';

const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);

describe('toggleOptionAnswer', () => {
  it('вариант не был отмечен — добавляется в конец', () => {
    expect(
      toggleOptionAnswer([{ itemId: 'i1', optionIds: ['a'] }], {
        itemId: 'i1',
        optionId: 'b',
      }),
    ).toEqual({ itemId: 'i1', optionIds: ['a', 'b'] });
  });

  it('вариант был отмечен — снимается, остальные на месте', () => {
    expect(
      toggleOptionAnswer([{ itemId: 'i1', optionIds: ['a', 'b'] }], {
        itemId: 'i1',
        optionId: 'a',
      }),
    ).toEqual({ itemId: 'i1', optionIds: ['b'] });
  });

  it('ответа на вопрос ещё нет — один отмеченный вариант', () => {
    expect(toggleOptionAnswer([], { itemId: 'i1', optionId: 'a' })).toEqual({
      itemId: 'i1',
      optionIds: ['a'],
    });
  });

  it('объяснение (text, ADR-0146) переносится как есть', () => {
    expect(
      toggleOptionAnswer([{ itemId: 'i1', optionIds: [], text: 'потому' }], {
        itemId: 'i1',
        optionId: 'a',
      }),
    ).toEqual({ itemId: 'i1', optionIds: ['a'], text: 'потому' });
  });
});

describe('ExamAttemptsService.saveAnswers({ toggleOption }) — против Mongo', () => {
  let ctx: AttemptsTestContext;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function startMultipleAttempt(): Promise<{
    attemptId: string;
    itemId: string;
    optionIds: string[];
  }> {
    const item = await ctx.examItemsService.create(
      {
        kind: 'multiple',
        prompt: 'Какие формы входят в третий уровень?',
        options: [
          { text: 'А', correct: true },
          { text: 'Б', correct: true },
          { text: 'В', correct: false },
        ],
      },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Формы', blocks: [{ title: '', itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' }, NOW);
    const attempt = await ctx.service.start(exam.id, USER_A, NOW);
    const optionIds = attempt.blocks[0]?.questions[0]?.options.map((o) => o.id) ?? [];
    return { attemptId: attempt.id, itemId: item.id, optionIds };
  }

  // Сценарий находки F27: два нажатия за ~300 мс, оба прочитали пустой ответ.
  // Настоящий Promise.all против mongodb-memory-server здесь не годится: порядок
  // двух реальных запросов к серверу не детерминирован — иногда первый вызов
  // успевает и прочитать, и записать до чтения второго, конфликта CAS нет и
  // вызовов findOneAndUpdate два, а не три (так тест мигнул в CI 2026-10-02;
  // мигающий тест запрещён, CLAUDE.md «Детерминизм»). Поэтому момент гонки
  // фиксирует мок: А уже прочитал пустой ответ и собирается писать — и именно
  // тут Б целиком проходит между чтением и записью А. Сами запросы к Mongo —
  // настоящие, по-прежнему не мок модели.
  it('Б успел между чтением и записью А — оба отмечены, ничего не потеряно', async () => {
    const { attemptId, itemId, optionIds } = await startMultipleAttempt();
    const [a, b] = optionIds;
    if (!a || !b) throw new Error('unreachable: у вопроса три варианта');

    const originalFindOneAndUpdate = ctx.attemptModel.findOneAndUpdate.bind(
      ctx.attemptModel,
    );
    const casSpy = jest.spyOn(ctx.attemptModel, 'findOneAndUpdate');
    // Только первый CAS (запись А со старым `answers`): Б проходит целиком, его
    // собственный CAS идёт уже через оригинал — once-реализация израсходована.
    // Затем настоящий CAS А со старыми аргументами промахивается, цикл А
    // перечитывает ответы и дописывает А поверх Б.
    casSpy.mockImplementationOnce(
      (...args: Parameters<typeof originalFindOneAndUpdate>) => {
        const pending = (async () => {
          await ctx.service.saveAnswers(
            attemptId,
            USER_A,
            { toggleOption: { itemId, optionId: b } },
            NOW,
          );
          return originalFindOneAndUpdate(...args).lean();
        })();
        return { lean: () => pending } as never;
      },
    );
    try {
      await ctx.service.saveAnswers(
        attemptId,
        USER_A,
        { toggleOption: { itemId, optionId: a } },
        NOW,
      );

      // Без счёта вызовов тест прошёл бы и при гонке, которой не было, и при
      // повторе, которого не случилось. Ровно три: промах А, запись Б, повтор А.
      expect(casSpy).toHaveBeenCalledTimes(3);
    } finally {
      casSpy.mockRestore();
    }

    const saved = await ctx.service.getOwn(attemptId, USER_A, NOW);
    expect([...(saved.answers[0]?.optionIds ?? [])].sort()).toEqual([a, b].sort());
  });

  it('повторное переключение того же варианта снимает отметку (read-after-write)', async () => {
    const { attemptId, itemId, optionIds } = await startMultipleAttempt();
    const [a] = optionIds;
    if (!a) throw new Error('unreachable');
    const change = { toggleOption: { itemId, optionId: a } };

    await ctx.service.saveAnswers(attemptId, USER_A, change, NOW);
    const off = await ctx.service.saveAnswers(attemptId, USER_A, change, NOW);

    expect(off.answers).toEqual([{ itemId, optionIds: [] }]);
    const saved = await ctx.service.getOwn(attemptId, USER_A, NOW);
    expect(saved.answers).toEqual([{ itemId, optionIds: [] }]);
  });
});
