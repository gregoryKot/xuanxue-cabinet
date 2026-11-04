// Сборка payload для create()/update() ChannelsService — вынесено, чтобы
// файл сервиса уместился в лимит (CLAUDE.md «Храповики», 150 строк).
import type { Model } from 'mongoose';
import type { CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import type { UpdateCommand } from '../common/patch-update';
import { groupSelectionFields } from '../groups/group-selection';
import type { GroupRecord } from '../groups/group.schema';

/** Тело POST /channels → документ модели. `Record<string, unknown>` явно:
 * тело уже проверено ValidationPipe (CreateChannelDto implements
 * CreateChannelInput). */
export async function buildChannelCreatePayload(
  groupModel: Model<GroupRecord>,
  input: CreateChannelInput,
  target: string,
): Promise<Record<string, unknown>> {
  // Подпись у канала не хранится: нужны только проверенные id (ADR-0196).
  const { groupIds } = await groupSelectionFields(groupModel, input.groupIds ?? []);
  return {
    type: input.type,
    title: input.title,
    config: input.config,
    target,
    active: true,
    groupIds,
  };
}

/** Команда тела PATCH /channels/:id. `target` при смене `config` добавляет сам
 * сервис: ему для этого нужен текущий `type` канала из базы (typeOf()). */
export async function buildChannelUpdate(
  groupModel: Model<GroupRecord>,
  input: UpdateChannelInput,
): Promise<UpdateCommand> {
  const { groupIds, ...fields } = input;
  const { groupIds: resolved } = await groupSelectionFields(groupModel, groupIds);
  return { $set: { ...fields, ...(resolved ? { groupIds: resolved } : {}) } };
}
