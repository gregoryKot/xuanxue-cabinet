// Приём «удалить можно только черновик» — общий для банка вопросов
// (ExamItemsService) и формы экзамена (ExamsService, ТЗ 4.3 п.5: на
// опубликованный или архивный документ уже могут ссылаться сданные работы).
// CLAUDE.md «одна механика — один компонент», тот же принцип и то же место,
// что у claim-once.ts. Один запрос на условии status: 'draft' — без гонки
// между проверкой статуса и удалением; второй запрос ниже только объясняет
// причину нулевого результата (не найден vs не черновик). Тексты сообщений —
// у каждого вызывающего свои (VOICE.md), сюда передаются параметром.
import type { Model, QueryFilter } from 'mongoose';
import { ConflictError, NotFoundError } from './errors';

export async function removeIfDraft<T>(
  model: Model<T>,
  id: string,
  notFoundMessage: string,
  notDraftMessage: string,
): Promise<void> {
  const filter: Record<string, unknown> = { _id: id, status: 'draft' };
  const { deletedCount } = await model.deleteOne(filter as QueryFilter<T>);
  if (deletedCount > 0) return;
  const stillThere = await model.exists({ _id: id } as QueryFilter<T>);
  if (stillThere) throw new ConflictError(notDraftMessage);
  throw new NotFoundError(notFoundMessage);
}
