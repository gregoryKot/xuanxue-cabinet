// Группа занятия для записи (ADR-0195): `groupId`, `forAllGroups` и производная
// подпись `groupLabel` идут вместе, чтобы не разойтись. Вынесено из
// ClassesService, чтобы create и update не дублировали разбор «не прислали /
// сбросили / задали / для всех».
import type { Model, Types } from 'mongoose';
import { ALL_GROUPS_LABEL } from '@xuanxue/shared';
import { resolveGroup } from '../groups/group-resolve';
import type { GroupRecord } from '../groups/group.schema';

/** Изменение полей группы в документе занятия. */
export interface ClassGroupChange {
  $set: { groupId?: Types.ObjectId; forAllGroups?: boolean; groupLabel?: string };
  $unset: { groupId?: '' };
}

export interface ClassGroupInput {
  groupId?: string | null;
  forAllGroups?: boolean;
}

/** Ничего не прислали — группу не трогаем (PATCH без поля). «Для всех» главнее
 * `groupId`: поле снимается, подпись — «все группы». Иначе `null` снимает
 * группу, id — проверяется и ставится; выбор любой группы или «без группы»
 * заодно выключает «для всех». */
export async function classGroupChange(
  groupModel: Model<GroupRecord>,
  input: ClassGroupInput,
): Promise<ClassGroupChange> {
  const { groupId, forAllGroups } = input;
  if (forAllGroups === true) {
    return {
      $set: { forAllGroups: true, groupLabel: ALL_GROUPS_LABEL },
      $unset: { groupId: '' },
    };
  }
  if (groupId === undefined && forAllGroups === undefined)
    return { $set: {}, $unset: {} };
  if (groupId === undefined) {
    // Только «для всех» выключили: группы нет, пока её не выберут.
    return {
      $set: { forAllGroups: false, groupLabel: '' },
      $unset: { groupId: '' },
    };
  }
  if (groupId === null) {
    return { $set: { forAllGroups: false, groupLabel: '' }, $unset: { groupId: '' } };
  }
  const group = await resolveGroup(groupModel, groupId);
  return {
    $set: { groupId: group.id, forAllGroups: false, groupLabel: group.name },
    $unset: {},
  };
}
