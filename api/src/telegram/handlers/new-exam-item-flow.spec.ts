// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// учитель заводит вопрос в боте (ТЗ 4б.3, docs/PLAN.md §12) — четыре шага до
// сохранения через ExamBotService.createExamItem → тот же ExamItemsService,
// что и кабинет (ADR-0024). Read-after-write — ExamItemsService.list/getById
// после «Сохранить»; идемпотентность — повторный клик не плодит второй
// вопрос; доступ — только штат; сбой посреди диалога не закрывает черновик
// раньше TTL.
import { DateTime } from 'luxon';
import type { BotSessionLean } from '../bot-session.lean';
import type { BotSessionService } from '../bot-session.service';
import { GENERIC_ERROR } from './callback-actions';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import {
  handleNewExamItemCancel,
  handleNewExamItemDone,
  handleNewExamItemKind,
  handleNewExamItemOptionToggle,
} from './new-exam-item-callback';
import {
  CHAT_ID,
  clearNewExamItemFlowTest,
  seedNewExamItemTeacher,
  setupNewExamItemFlowTest,
  textMessage,
  type NewExamItemFlowContext,
} from './new-exam-item-flow.test-support';
import { NewExamItemMessageHandler } from './new-exam-item-message.handler';
import { handleNewExamItemSave } from './new-exam-item-save-callback';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);

/** Активная сессия черновика — между шагами диалога она всегда есть, `null`
 * означал бы поломку теста (сессия истекла или не заведена), не сценарий,
 * который стоит проверять здесь `?.`. */
async function activeSession(botSessions: BotSessionService): Promise<BotSessionLean> {
  const session = await botSessions.get(CHAT_ID, NOW);
  if (!session) throw new Error('ожидание черновика не найдено — сессия истекла?');
  return session;
}

describe('учитель заводит вопрос в боте (интеграция, Mongo)', () => {
  let flowCtx: NewExamItemFlowContext;

  beforeAll(async () => {
    flowCtx = await setupNewExamItemFlowTest();
  }, 60_000);

  afterAll(async () => {
    await flowCtx.flow.ctx.memory.stop();
  });

  afterEach(async () => {
    await clearNewExamItemFlowTest(flowCtx);
  });

  function save() {
    const { botSessions, examBot } = flowCtx.flow;
    const saveCtx = fakeFlowCtx();
    return handleNewExamItemSave(
      saveCtx.ctx,
      botSessions,
      examBot,
      flowCtx.usersService,
      undefined,
      CHAT_ID,
      NOW,
    ).then(() => saveCtx);
  }

  it('/вопрос — незнакомцу и не-штату молчит', async () => {
    const { ctx, replies } = fakeFlowCtx();
    await flowCtx.commandHandler.handle(ctx, NOW);
    expect(replies).toEqual([]);
  });

  it('полный диалог single-вопроса до сохранения — read-after-write через ExamItemsService', async () => {
    await seedNewExamItemTeacher(flowCtx);
    const { botSessions, ctx: attemptsCtx } = flowCtx.flow;

    // Screen 1 — команда штату показывает выбор типа.
    const commandCtx = fakeFlowCtx();
    await flowCtx.commandHandler.handle(commandCtx.ctx, NOW);
    expect(commandCtx.replies[0]).toContain('Выберите тип ответа');

    // Шаг 1 — тип.
    const kindCtx = fakeFlowCtx();
    await handleNewExamItemKind(kindCtx.ctx, botSessions, CHAT_ID, 'single', NOW);
    expect(kindCtx.edits[0]).toContain('формулировку');

    // Шаг 2 — формулировка.
    const promptMsg = textMessage('Сколько форм в третьем уровне?');
    await flowCtx.messageHandler.handle(
      promptMsg.ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    expect(promptMsg.replies[0]).toContain('первый вариант');

    // Шаг 3 — варианты, по одному сообщению.
    const option1 = textMessage('Три');
    await flowCtx.messageHandler.handle(
      option1.ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    const option2 = textMessage('Пять');
    await flowCtx.messageHandler.handle(
      option2.ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    expect(option2.replies[0]).toContain('Готово');

    // «Готово» варианты → экран отметки верного.
    const doneOptionsCtx = fakeFlowCtx();
    await handleNewExamItemDone(doneOptionsCtx.ctx, botSessions, CHAT_ID, 'options', NOW);
    expect(doneOptionsCtx.edits[0]).toContain('верный');

    // Шаг «отметка верного» — single: один тап сразу отмечает и продолжает
    // прямо к итогу (шаг «критерии» убран, ADR-0128).
    const markCorrectCtx = fakeFlowCtx();
    await handleNewExamItemOptionToggle(markCorrectCtx.ctx, botSessions, CHAT_ID, 0, NOW);
    expect(markCorrectCtx.edits[0]).toContain('Проверьте вопрос');
    expect(markCorrectCtx.edits[0]).toContain('Три — верно');

    // Итог — «Сохранить».
    const saveCtx = await save();
    expect(saveCtx.edits[0]).toContain('Вопрос сохранён');
    expect(saveCtx.edits[0]).toContain('«Вопросы»');

    // Read-after-write — тот же ExamItemsService, что и кабинет.
    const items = await attemptsCtx.examItemsService.list({});
    expect(items).toHaveLength(1);
    expect(items[0]?.prompt).toBe('Сколько форм в третьем уровне?');
    expect(items[0]?.options.map((o) => ({ text: o.text, correct: o.correct }))).toEqual([
      { text: 'Три', correct: true },
      { text: 'Пять', correct: false },
    ]);
    expect(
      items[0]?.options.every((o) => typeof o.id === 'string' && o.id.length > 0),
    ).toBe(true);
    const savedId = items[0]?.id;
    if (!savedId) throw new Error('вопрос не сохранился');
    const found = await attemptsCtx.examItemsService.getById(savedId);
    expect(found.prompt).toBe('Сколько форм в третьем уровне?');

    // Идемпотентность — повторный клик «Сохранить» не заводит второй вопрос.
    const secondSaveCtx = await save();
    expect(secondSaveCtx.edits[0]).toContain('уже сохранён');
    expect(await attemptsCtx.examItemsService.list({})).toHaveLength(1);
  });

  it('text-вопрос — без шага вариантов, формулировка сразу ведёт к итогу', async () => {
    await seedNewExamItemTeacher(flowCtx);
    const { botSessions, ctx: attemptsCtx } = flowCtx.flow;

    await handleNewExamItemKind(fakeFlowCtx().ctx, botSessions, CHAT_ID, 'text', NOW);
    const promptMsg = textMessage('Опишите форму словами');
    await flowCtx.messageHandler.handle(
      promptMsg.ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    // Тип 'text' — вариантов не бывает: следующий шаг сразу итог (шаг
    // «критерии» убран, ADR-0128).
    expect(promptMsg.replies[0]).toContain('Проверьте вопрос');
    expect(promptMsg.replies[0]).not.toContain('Варианты');

    const saveCtx = await save();
    expect(saveCtx.edits[0]).toContain('Вопрос сохранён');
    const items = await attemptsCtx.examItemsService.list({});
    expect(items[0]?.prompt).toBe('Опишите форму словами');
    expect(items[0]?.options).toEqual([]);
  });

  it('multiple-вопрос — переключатели и «Готово» на шаге отметки верного', async () => {
    await seedNewExamItemTeacher(flowCtx);
    const { botSessions, ctx: attemptsCtx } = flowCtx.flow;

    await handleNewExamItemKind(fakeFlowCtx().ctx, botSessions, CHAT_ID, 'multiple', NOW);
    await flowCtx.messageHandler.handle(
      textMessage('Какие формы входят в третий уровень?').ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    await flowCtx.messageHandler.handle(
      textMessage('Форма А').ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    await flowCtx.messageHandler.handle(
      textMessage('Форма Б').ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    await handleNewExamItemDone(fakeFlowCtx().ctx, botSessions, CHAT_ID, 'options', NOW);

    // «Готово» без единой отметки — экран остаётся тем же (не продвигается).
    const emptyDoneCtx = fakeFlowCtx();
    await handleNewExamItemDone(emptyDoneCtx.ctx, botSessions, CHAT_ID, 'correct', NOW);
    expect(emptyDoneCtx.edits).toEqual([]);

    await handleNewExamItemOptionToggle(fakeFlowCtx().ctx, botSessions, CHAT_ID, 0, NOW);
    await handleNewExamItemOptionToggle(fakeFlowCtx().ctx, botSessions, CHAT_ID, 1, NOW);
    const doneCtx = fakeFlowCtx();
    await handleNewExamItemDone(doneCtx.ctx, botSessions, CHAT_ID, 'correct', NOW);
    expect(doneCtx.edits[0]).toContain('Проверьте вопрос');

    await save();

    const items = await attemptsCtx.examItemsService.list({});
    expect(items[0]?.options.map((o) => o.correct)).toEqual([true, true]);
  });

  it('«Отмена» на любом шаге закрывает черновик, не сохраняя вопрос', async () => {
    await seedNewExamItemTeacher(flowCtx);
    const { botSessions, ctx: attemptsCtx } = flowCtx.flow;

    await handleNewExamItemKind(fakeFlowCtx().ctx, botSessions, CHAT_ID, 'text', NOW);
    const cancelCtx = fakeFlowCtx();
    await handleNewExamItemCancel(cancelCtx.ctx, botSessions, CHAT_ID);

    expect(cancelCtx.edits[0]).toContain('отменён');
    expect(await botSessions.get(CHAT_ID, NOW)).toBeNull();
    expect(await attemptsCtx.examItemsService.list({})).toEqual([]);
  });

  it('сбой посреди диалога — фраза в чат, черновик не закрывается раньше TTL', async () => {
    await seedNewExamItemTeacher(flowCtx);
    const { botSessions } = flowCtx.flow;
    await handleNewExamItemKind(fakeFlowCtx().ctx, botSessions, CHAT_ID, 'text', NOW);

    const failingBotSessions = {
      get: botSessions.get.bind(botSessions),
      setNewExamItemDraft: () => Promise.reject(new Error('mongo упал')),
    } as unknown as BotSessionService;
    const failingHandler = new NewExamItemMessageHandler(
      failingBotSessions,
      flowCtx.flow.registry,
    );
    const promptMsg = textMessage('Формулировка, которая не сохранится из-за сбоя');
    const session = await activeSession(botSessions);

    await expect(
      failingHandler.handle(promptMsg.ctx, CHAT_ID, session, NOW),
    ).resolves.toBeUndefined();

    expect(promptMsg.replies).toEqual([GENERIC_ERROR]);
    // Черновик пережил сбой — TTL, не мгновенная очистка (CLAUDE.md
    // «Хендлер, упавший на середине диалога, не оставляет ожидание навсегда»
    // читается как раз наоборот здесь: не закрывает РАНЬШЕ срока).
    const survived = await botSessions.get(CHAT_ID, NOW);
    expect(survived?.kind).toBe('examItemDraft');
    expect(await botSessions.hasExpired(CHAT_ID, NOW.plus({ minutes: 61 }))).toBe(
      'examItemDraft',
    );
  });

  it('«Сохранить» на неполном черновике (защита в глубину) — ошибка DTO, вопрос не создан', async () => {
    await seedNewExamItemTeacher(flowCtx);
    const { botSessions, ctx: attemptsCtx } = flowCtx.flow;
    // В обычном диалоге это невозможно (каждый шаг проверяет DTO раньше) —
    // сюда попадаем только если черновик поправили мимо шагов диалога.
    await handleNewExamItemKind(fakeFlowCtx().ctx, botSessions, CHAT_ID, 'text', NOW);
    await botSessions.setNewExamItemDraft(CHAT_ID, { step: 'confirm', prompt: '' }, NOW);

    const saveCtx = await save();

    expect(saveCtx.edits[0]).toContain('заполните поле');
    expect(await attemptsCtx.examItemsService.list({})).toEqual([]);
  });
});
