// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): снимок формы, шифрование, идемпотентность старта, лимит попыток,
// частичное сохранение, владение. Время/дедлайн — отдельный файл
// (exam-attempts.time.spec.ts, тот же приём, что у
// telegram-teacher-notifier.time.spec.ts, «файл-лимит спеков», CLAUDE.md «Файлы»).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { UserLean } from '../users/users.service';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

describe('ExamAttemptsService', () => {
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

  async function createPublishedItem(overrides: Record<string, unknown> = {}) {
    const created = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'исходная формулировка', ...overrides },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(created.id, { status: 'published' }, NOW);
    return created.id;
  }

  async function createPublishedExam(options: {
    itemIds: string[];
    shuffle?: boolean;
    attemptsAllowed?: number;
  }) {
    const created = await ctx.examsService.create(
      {
        title: 'Экзамен по третьей форме',
        blocks: [{ title: 'Форма', itemIds: options.itemIds, shuffle: options.shuffle }],
        attemptsAllowed: options.attemptsAllowed,
      },
      AUTHOR_ID,
    );
    await ctx.examsService.update(created.id, { status: 'published' });
    return created.id;
  }

  it('старт → список: read-after-write, снимок расшифрован, в базе есть correct', async () => {
    const itemId = await createPublishedItem({
      kind: 'single',
      options: [
        { text: 'верно', correct: true },
        { text: 'неверно', correct: false },
      ],
    });
    const examId = await createPublishedExam({ itemIds: [itemId] });

    const started = await ctx.service.start(examId, USER_A, NOW);
    expect(started.status).toBe('in_progress');
    expect(started.blocks[0]?.questions[0]?.itemId).toBe(itemId);

    // Ученику ничего похожего на «верный вариант» не уходит.
    const question = started.blocks[0]?.questions[0];
    expect(question).not.toHaveProperty('criteria');
    for (const option of question?.options ?? []) {
      expect(option).not.toHaveProperty('correct');
    }
    expect(JSON.stringify(started)).not.toContain('correct');
    expect(JSON.stringify(started)).not.toContain('criteria');

    // Сырая Mongo — снимок зашифрован целиком, но физически хранит и correct,
    // и criteria (для будущей проверки, слой 4.6) — не пустая заглушка.
    const raw = await ctx.attemptModel.findById(started.id).lean();
    expect(raw?.blocks).not.toContain('"correct"'); // не открытым текстом
    expect(raw?.blocks).not.toBe('[]');

    const list = await ctx.service.list({ examId }, staffUser(false, USER_A), NOW);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(started.id);
  });

  it('снимок не едет за банком: старт → правка вопроса → в попытке старая формулировка', async () => {
    const itemId = await createPublishedItem({ prompt: 'старая формулировка' });
    const examId = await createPublishedExam({ itemIds: [itemId] });

    const started = await ctx.service.start(examId, USER_A, NOW);
    expect(started.blocks[0]?.questions[0]?.prompt).toBe('старая формулировка');

    await ctx.examItemsService.update(itemId, { prompt: 'новая формулировка' }, NOW);

    const list = await ctx.service.list({ examId }, staffUser(false, USER_A), NOW);
    expect(list[0]?.blocks[0]?.questions[0]?.prompt).toBe('старая формулировка');
  });

  it('перемешивание фиксируется при старте: два чтения — один и тот же порядок', async () => {
    const itemIds = await Promise.all([
      createPublishedItem({ prompt: 'вопрос А' }),
      createPublishedItem({ prompt: 'вопрос Б' }),
      createPublishedItem({ prompt: 'вопрос В' }),
    ]);
    const examId = await createPublishedExam({ itemIds, shuffle: true });

    const started = await ctx.service.start(examId, USER_A, NOW);
    const orderAfterStart = started.blocks[0]?.questions.map((q) => q.itemId);

    const readAgain = await ctx.service.list({ examId }, staffUser(false, USER_A), NOW);
    const orderAfterRefresh = readAgain[0]?.blocks[0]?.questions.map((q) => q.itemId);

    expect(orderAfterRefresh).toEqual(orderAfterStart);
  });

  it('повторный старт при незаконченной попытке отдаёт ту же (идемпотентность)', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });

    const first = await ctx.service.start(examId, USER_A, NOW);
    const second = await ctx.service.start(examId, USER_A, NOW);

    expect(second.id).toBe(first.id);
    await expect(
      ctx.attemptModel.countDocuments({ examId, userId: USER_A }),
    ).resolves.toBe(1);
  });

  it('превышение числа попыток — отказ с понятным текстом', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId], attemptsAllowed: 1 });

    const first = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(first.id, USER_A, NOW);

    await expect(ctx.service.start(examId, USER_A, NOW)).rejects.toThrow(
      'Попросите учителя открыть ещё одну попытку',
    );
  });

  it('гонка двух стартов подряд: E11000 при вставке — отдаёт попытку конкурента, не бросает и не плодит вторую', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    // Имитация гонки (exam-attempts.service.ts, catch в start()): к моменту,
    // когда этот вызов пытается вставить attemptNo=1, конкурент только что
    // вставил свою попытку с тем же attemptNo — insert падает на E11000,
    // findInProgressAttempt внутри catch находит её и отдаёт вместо второй.
    const originalCreate = ctx.attemptModel.create.bind(ctx.attemptModel);
    let winnerId = '';
    jest.spyOn(ctx.attemptModel, 'create').mockImplementationOnce(async () => {
      const winner = await originalCreate({
        examId,
        examTitle: 'т',
        userId: USER_A,
        attemptNo: 1,
        status: 'in_progress',
        blocks: '[]',
        answers: '[]',
        startedAt: NOW.toJSDate(),
      });
      winnerId = winner._id.toString();
      const duplicateKeyError: Error & { code?: number } = new Error('E11000');
      duplicateKeyError.code = 11000;
      throw duplicateKeyError;
    });

    const started = await ctx.service.start(examId, USER_A, NOW);

    expect(started.id).toBe(winnerId);
    await expect(
      ctx.attemptModel.countDocuments({ examId, userId: USER_A }),
    ).resolves.toBe(1);
  });

  it('E11000 при вставке, но конкурент не нашёлся (защита в глубину) — исходная ошибка уходит наверх', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const duplicateKeyError: Error & { code?: number } = new Error('E11000');
    duplicateKeyError.code = 11000;
    jest.spyOn(ctx.attemptModel, 'create').mockRejectedValueOnce(duplicateKeyError);

    await expect(ctx.service.start(examId, USER_A, NOW)).rejects.toBe(duplicateKeyError);
  });

  it('ошибка вставки не E11000 — уходит наверх сразу, без поиска конкурента', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const dbError = new Error('connection lost');
    jest.spyOn(ctx.attemptModel, 'create').mockRejectedValueOnce(dbError);

    await expect(ctx.service.start(examId, USER_A, NOW)).rejects.toBe(dbError);
  });

  it('документ не найден сразу после create (защита в глубину) — программная ошибка', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    jest.spyOn(ctx.attemptModel, 'findById').mockReturnValueOnce({
      lean: () => Promise.resolve(null),
    } as never);

    await expect(ctx.service.start(examId, USER_A, NOW)).rejects.toThrow(
      'попытка не найдена сразу после создания',
    );
  });

  it('автосохранение: дедлайн истёк между проверкой и апдейтом (гонка) — тот же отказ «время вышло»', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);
    jest.spyOn(ctx.attemptModel, 'findOneAndUpdate').mockReturnValueOnce({
      lean: () => Promise.resolve(null),
    } as never);

    await expect(
      ctx.service.saveAnswers(started.id, USER_A, { answers: [] }, NOW),
    ).rejects.toThrow('Время экзамена вышло');
  });

  it('сдача: дедлайн истёк между проверкой и апдейтом (гонка) — тот же отказ «время вышло»', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);
    jest.spyOn(ctx.attemptModel, 'findOneAndUpdate').mockReturnValueOnce({
      lean: () => Promise.resolve(null),
    } as never);

    await expect(ctx.service.submit(started.id, USER_A, NOW)).rejects.toThrow(
      'Время экзамена вышло',
    );
  });

  it('GET /attempts: фильтр по status', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);
    await ctx.service.start(examId, USER_B, NOW);

    const submittedOnly = await ctx.service.list(
      { status: 'submitted' },
      staffUser(true, '507f1f77bcf86cd799439014'),
      NOW,
    );

    expect(submittedOnly.map((a) => a.id)).toEqual([started.id]);
  });

  it('старт на неопубликованной форме — отказ, попытка не создаётся', async () => {
    const itemId = await createPublishedItem();
    const created = await ctx.examsService.create(
      { title: 'Черновик формы', blocks: [{ itemIds: [itemId] }] },
      AUTHOR_ID,
    );

    await expect(ctx.service.start(created.id, USER_A, NOW)).rejects.toThrow(
      'ещё не открыт для сдачи',
    );
    await expect(ctx.attemptModel.countDocuments({})).resolves.toBe(0);
  });

  it('старт на несуществующей форме — NotFoundError', async () => {
    await expect(
      ctx.service.start('507f1f77bcf86cd799439099', USER_A, NOW),
    ).rejects.toThrow('Экзамен не найден');
  });

  it('автосохранение: частичное сохранение не стирает остальные ответы', async () => {
    const itemIds = await Promise.all([createPublishedItem(), createPublishedItem()]);
    const examId = await createPublishedExam({ itemIds });
    const started = await ctx.service.start(examId, USER_A, NOW);
    const [firstItemId, secondItemId] = itemIds;
    if (!firstItemId || !secondItemId) throw new Error('ожидались два вопроса');

    await ctx.service.saveAnswers(
      started.id,
      USER_A,
      { answers: [{ itemId: firstItemId, text: 'первый ответ' }] },
      NOW,
    );
    const afterSecond = await ctx.service.saveAnswers(
      started.id,
      USER_A,
      { answers: [{ itemId: secondItemId, text: 'второй ответ' }] },
      NOW,
    );

    expect(afterSecond.answers).toEqual(
      expect.arrayContaining([
        { itemId: firstItemId, text: 'первый ответ' },
        { itemId: secondItemId, text: 'второй ответ' },
      ]),
    );
  });

  it('ответ на itemId не из снимка — 400, ответ не сохраняется', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);

    await expect(
      ctx.service.saveAnswers(
        started.id,
        USER_A,
        { answers: [{ itemId: '507f1f77bcf86cd799439099', text: 'мусор' }] },
        NOW,
      ),
    ).rejects.toThrow('не из вашей попытки');

    const stillEmpty = await ctx.service.list({ examId }, staffUser(false, USER_A), NOW);
    expect(stillEmpty[0]?.answers).toEqual([]);
  });

  it('сдача: in_progress → submitted, submittedAt = сейчас', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);

    const submitted = await ctx.service.submit(started.id, USER_A, NOW);

    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).toBe(NOW.toUTC().toISO());
  });

  it('повторная сдача уже сданной попытки — отказ, не NotFound', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);

    await expect(ctx.service.submit(started.id, USER_A, NOW)).rejects.toThrow(
      'уже сдана',
    );
  });

  it('чужую попытку не видно и не изменить — свой userId в фильтре, не сравнение после чтения', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    const started = await ctx.service.start(examId, USER_A, NOW);

    await expect(
      ctx.service.saveAnswers(started.id, USER_B, { answers: [] }, NOW),
    ).rejects.toThrow('Попытка не найдена');
    await expect(ctx.service.submit(started.id, USER_B, NOW)).rejects.toThrow(
      'Попытка не найдена',
    );

    const listForB = await ctx.service.list({ examId }, staffUser(false, USER_B), NOW);
    expect(listForB).toEqual([]);
  });

  it('учитель видит все попытки школы, ученик — только свои', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.start(examId, USER_B, NOW);

    const asStudentA = await ctx.service.list({}, staffUser(false, USER_A), NOW);
    expect(asStudentA).toHaveLength(1);
    expect(asStudentA[0]?.userId).toBe(USER_A);

    const asTeacher = await ctx.service.list(
      {},
      staffUser(true, '507f1f77bcf86cd799439014'),
      NOW,
    );
    expect(asTeacher).toHaveLength(2);
  });

  // Помощник учителя правами равен учителю (STAFF_ROLES, shared/auth.ts) —
  // раньше проверка перечисляла teacher и admin и помощника не считала.
  it('помощник учителя видит все попытки школы', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.start(examId, USER_B, NOW);

    const asAssistant = await ctx.service.list(
      {},
      {
        id: '507f1f77bcf86cd799439015',
        name: 'Помощник',
        roles: ['assistant'],
        tz: 'Asia/Jerusalem',
        status: 'active',
      },
      NOW,
    );

    expect(asAssistant).toHaveLength(2);
  });

  // Экран «Проверка работ» (слой 4.6): голый userId учителю бесполезен —
  // нужно имя, одним запросом на список (UserNamesService), не N+1. Ученику
  // своя попытка и так подписана, поле не приходит вовсе (shared/exams.ts).
  it('сотрудник видит имя ученика в списке попыток, ученик своё имя не получает', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    await ctx.userModel.create({
      _id: new Types.ObjectId(USER_A),
      name: 'Ученик Иванов',
      roles: [],
      status: 'active',
    });
    await ctx.service.start(examId, USER_A, NOW);

    const asTeacher = await ctx.service.list(
      {},
      staffUser(true, '507f1f77bcf86cd799439014'),
      NOW,
    );
    expect(asTeacher[0]?.userName).toBe('Ученик Иванов');

    const asStudent = await ctx.service.list({}, staffUser(false, USER_A), NOW);
    expect(asStudent[0]?.userName).toBeUndefined();
  });

  // Ученик — это подтверждённый человек без ролей (ADR-0026), роли
  // `student` больше нет в гвардах: список должен скоупиться по владению
  // и для него.
  it('подтверждённый человек без ролей видит только свои попытки', async () => {
    const itemId = await createPublishedItem();
    const examId = await createPublishedExam({ itemIds: [itemId] });
    await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.start(examId, USER_B, NOW);

    const asStudent = await ctx.service.list(
      {},
      {
        id: USER_A,
        name: 'Ученик',
        roles: [],
        tz: 'Asia/Jerusalem',
        status: 'active',
      },
      NOW,
    );

    expect(asStudent).toHaveLength(1);
    expect(asStudent[0]?.userId).toBe(USER_A);
  });
});

/** `UserLean` для `list()` — сервис читает только `id`/`roles` (ExamAttemptsService.list). */
function staffUser(isStaff: boolean, id: string): UserLean {
  return {
    id,
    name: 'Тест',
    roles: isStaff ? ['teacher'] : [],
    tz: 'Asia/Jerusalem',
    status: 'active',
  };
}
