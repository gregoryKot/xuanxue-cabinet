// Отбор каналов занятия в расписании для отправки — вынесено из
// broadcast-planner.queries.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
// Куда уйдёт занятие, решают только галочки «занятие ↔ канал»
// (`classes.channelIds`, ADR-0192); здесь остаётся одно условие — канал
// включён (CLAUDE.md «Только активные каналы»).
import type { Model, Types } from 'mongoose';
import type { ChannelRecord } from '../channels/channel.schema';

/** Активные каналы из списка `channelIds` занятия на момент отправки. Старое
 * поле `tags` у канала (ADR-0108, снято ADR-0192), если оно ещё осталось в
 * документе, не читается и ничего не отсеивает. */
export async function findActiveChannelIds(
  channelModel: Model<ChannelRecord>,
  channelIds: readonly Types.ObjectId[],
): Promise<Types.ObjectId[]> {
  const docs = await channelModel
    .find({ _id: { $in: channelIds }, active: true }, { _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  return docs.map((doc) => doc._id);
}
