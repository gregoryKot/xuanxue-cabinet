// Сборка payload для create()/update() ChannelsService — вынесено, чтобы
// файл сервиса уместился в лимит (CLAUDE.md «Храповики», 150 строк).
import type { Model, Types } from 'mongoose';
import type { CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import type { UpdateCommand } from '../common/patch-update';
import { resolveGroup } from '../groups/group-resolve';
import type { GroupRecord } from '../groups/group.schema';

/** Изменение группы канала: `undefined` — не трогаем, `null` — убрать поле,
 * id — проверить, что группа есть, и поставить (ADR-0195). */
async function channelGroupChange(
  groupModel: Model<GroupRecord>,
  groupId: string | null | undefined,
): Promise<{ $set: { groupId?: Types.ObjectId }; $unset: { groupId?: '' } }> {
  if (groupId === undefined) return { $set: {}, $unset: {} };
  if (groupId === null) return { $set: {}, $unset: { groupId: '' } };
  return { $set: { groupId: (await resolveGroup(groupModel, groupId)).id }, $unset: {} };
}

/** Тело POST /channels → документ модели. `Record<string, unknown>` явно:
 * тело уже проверено ValidationPipe (CreateChannelDto implements
 * CreateChannelInput). */
export async function buildChannelCreatePayload(
  groupModel: Model<GroupRecord>,
  input: CreateChannelInput,
  target: string,
): Promise<Record<string, unknown>> {
  const group = await channelGroupChange(groupModel, input.groupId);
  return {
    type: input.type,
    title: input.title,
    config: input.config,
    target,
    active: true,
    ...group.$set,
  };
}

/** Команда тела PATCH /channels/:id: `$set` полей и `$unset` группы, если её
 * сняли (`null`). `target` при смене `config` добавляет сам сервис: ему для
 * этого нужен текущий `type` канала из базы (typeOf()). */
export async function buildChannelUpdate(
  groupModel: Model<GroupRecord>,
  input: UpdateChannelInput,
): Promise<UpdateCommand> {
  const { groupId, ...fields } = input;
  const group = await channelGroupChange(groupModel, groupId);
  const update: UpdateCommand = { $set: { ...fields, ...group.$set } };
  if (group.$unset.groupId !== undefined) update.$unset = group.$unset;
  return update;
}
