// Чистая логика, без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика») — removeOne здесь jest.fn(), не настоящий сервис.
import { ConflictError, NotFoundError } from './errors';
import { bulkRemove } from './bulk-remove';

describe('bulkRemove', () => {
  it('все id удаляются — deletedIds по порядку входа, failed пуст', async () => {
    const removeOne = jest.fn().mockResolvedValue(undefined);

    const result = await bulkRemove(['a', 'b', 'c'], removeOne);

    expect(result).toEqual({ deletedIds: ['a', 'b', 'c'], failed: [] });
    expect(removeOne).toHaveBeenCalledTimes(3);
  });

  it('пустой список — пустой результат, removeOne не зовётся', async () => {
    const removeOne = jest.fn();

    const result = await bulkRemove([], removeOne);

    expect(result).toEqual({ deletedIds: [], failed: [] });
    expect(removeOne).not.toHaveBeenCalled();
  });

  it('смешанный отказ доменной ошибкой — порядок и тексты сохраняются, остальные продолжаются', async () => {
    const removeOne = jest.fn((id: string) => {
      if (id === 'published') return Promise.reject(new ConflictError('не черновик'));
      if (id === 'missing') return Promise.reject(new NotFoundError('не найден'));
      return Promise.resolve(undefined);
    });

    const result = await bulkRemove(
      ['draft1', 'published', 'draft2', 'missing'],
      removeOne,
    );

    expect(result).toEqual({
      deletedIds: ['draft1', 'draft2'],
      failed: [
        { id: 'published', message: 'не черновик' },
        { id: 'missing', message: 'не найден' },
      ],
    });
  });

  it('дубли id обрабатываются один раз', async () => {
    const removeOne = jest.fn().mockResolvedValue(undefined);

    const result = await bulkRemove(['a', 'a', 'b', 'a'], removeOne);

    expect(result).toEqual({ deletedIds: ['a', 'b'], failed: [] });
    expect(removeOne).toHaveBeenCalledTimes(2);
  });

  it('неизвестная ошибка бросается наверх и останавливает обработку остальных id', async () => {
    const unknown = new Error('сетевой блип к Mongo');
    const removeOne = jest.fn((id: string) => {
      if (id === 'boom') return Promise.reject(unknown);
      return Promise.resolve(undefined);
    });

    await expect(bulkRemove(['a', 'boom', 'c'], removeOne)).rejects.toBe(unknown);
    expect(removeOne).toHaveBeenCalledTimes(2);
    expect(removeOne).not.toHaveBeenCalledWith('c');
  });
});
