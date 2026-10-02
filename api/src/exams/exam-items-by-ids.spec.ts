// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// фильтр `$in` с мягким удалением, отсутствующий id, число запросов.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import {
  AUTHOR_ID,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { findExamItemsByIds } from './exam-items-by-ids';

const NOW = DateTime.utc(2026, 10, 1, 12, 0, 0);

describe('findExamItemsByIds', () => {
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

  async function createItem(prompt: string): Promise<string> {
    const created = await ctx.examItemsService.create(
      { kind: 'text', prompt },
      AUTHOR_ID,
    );
    return created.id;
  }

  it('все вопросы по списку id — один запрос find, prompt расшифрован', async () => {
    const one = await createItem('первый');
    const two = await createItem('второй');
    const find = jest.spyOn(ctx.itemModel, 'find');
    try {
      const byId = await findExamItemsByIds(ctx.itemModel, [one, two], false);

      expect(find).toHaveBeenCalledTimes(1);
      expect(byId.size).toBe(2);
      expect(byId.get(one)?.prompt).toBe('первый');
      expect(byId.get(two)?.prompt).toBe('второй');
    } finally {
      find.mockRestore();
    }
  });

  it('повторы в списке — один документ на id', async () => {
    const one = await createItem('первый');

    const byId = await findExamItemsByIds(ctx.itemModel, [one, one], false);

    expect([...byId.keys()]).toEqual([one]);
  });

  it('пустой список — пустая Map без запроса к базе', async () => {
    const find = jest.spyOn(ctx.itemModel, 'find');
    try {
      const byId = await findExamItemsByIds(ctx.itemModel, [], false);

      expect(byId.size).toBe(0);
      expect(find).not.toHaveBeenCalled();
    } finally {
      find.mockRestore();
    }
  });

  it('мягко удалённый вопрос: без includeDeleted — «не найден», с includeDeleted — на месте (ADR-0140)', async () => {
    const id = await createItem('удалённый');
    await ctx.examItemsService.remove(id, NOW);

    await expect(findExamItemsByIds(ctx.itemModel, [id], false)).rejects.toThrow(
      'Вопрос не найден',
    );
    const withDeleted = await findExamItemsByIds(ctx.itemModel, [id], true);
    expect(withDeleted.get(id)?.prompt).toBe('удалённый');
  });

  it('неизвестный id среди известных — «не найден» целиком, не частичный снимок', async () => {
    const one = await createItem('первый');
    const unknown = new Types.ObjectId().toString();

    await expect(findExamItemsByIds(ctx.itemModel, [one, unknown], true)).rejects.toThrow(
      'Вопрос не найден',
    );
  });

  it('невалидный ObjectId — «не найден» без запроса к базе', async () => {
    const find = jest.spyOn(ctx.itemModel, 'find');
    try {
      await expect(findExamItemsByIds(ctx.itemModel, ['не-id'], true)).rejects.toThrow(
        'Вопрос не найден',
      );
      expect(find).not.toHaveBeenCalled();
    } finally {
      find.mockRestore();
    }
  });
});
