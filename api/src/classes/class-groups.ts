// Вспомогательное для ClassesService, вынесено, чтобы сервис не пух (ADR-0193):
// поля групп занятия и каналы по умолчанию.
import type { Model, Types } from 'mongoose';
import type { ChannelRecord } from '../channels/channel.schema';
import { resolveGroupSelection, type GroupSelection } from '../groups/group-selection';
import type { GroupRecord } from '../groups/group.schema';

/** `groupIds` не прислали — полей групп нет (PATCH их не трогает); прислали,
 * в том числе `[]`, — группы и подпись `groupLabel` идут вместе, чтобы не
 * разойтись. Подпись всегда выводится из групп, а не берётся из тела. */
export async function groupFields(
  groupModel: Model<GroupRecord>,
  groupIds: string[] | undefined,
): Promise<Partial<GroupSelection>> {
  if (groupIds === undefined) return {};
  return resolveGroupSelection(groupModel, groupIds);
}

/** Личный канал ученика (broadcastEligible: false, ADR-0027) сюда не
 * попадает: занятие не должно получить получателем рассылки чей-то личный чат
 * только потому, что он тоже type: telegram. */
export async function defaultTelegramChannelIds(
  channelModel: Model<ChannelRecord>,
): Promise<string[]> {
  const docs = await channelModel
    .find({ type: 'telegram', active: true, broadcastEligible: { $ne: false } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return docs.map((doc) => doc._id.toString());
}
