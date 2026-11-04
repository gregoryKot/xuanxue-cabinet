// Что делает занятие с выбранными группами: проверяет, что они есть, ставит
// в порядок создания и собирает подпись `groupLabel` (ADR-0193, ADR-0196). Одна функция
// на создание, правку занятия и переименование группы — подпись нигде больше
// не собирается, иначе места разошлись бы в порядке или разделителе.
import type { Model, Types } from 'mongoose';
import { GROUP_NOT_FOUND_MESSAGE, joinGroupNames } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { GroupRecord } from './group.schema';

export interface NamedGroup {
  _id: Types.ObjectId;
  name: string;
}

export interface GroupSelection {
  groupIds: Types.ObjectId[];
  groupLabel: string;
}

/** Подпись и порядок по списку групп школы. Группы, которых нет в `all`,
 * молча пропускаются: к переименованию это не относится, а выбор занятия
 * проверяет `resolveGroupSelection` до сюда. */
export function selectGroups(
  all: readonly NamedGroup[],
  ids: readonly (Types.ObjectId | string)[],
): GroupSelection {
  const wanted = new Set(ids.map((id) => id.toString()));
  const picked = all
    .filter((group) => wanted.has(group._id.toString()))
    .sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
  return {
    groupIds: picked.map((group) => group._id),
    groupLabel: joinGroupNames(picked.map((group) => group.name)),
  };
}

/** Выбор групп из тела запроса: дубли схлопываются, неизвестный id — 400. */
async function resolveGroupSelection(
  model: Model<GroupRecord>,
  ids: readonly string[],
): Promise<GroupSelection> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { groupIds: [], groupLabel: '' };
  const found = await model
    .find({ _id: { $in: unique } })
    .select('name')
    .lean<NamedGroup[]>();
  if (found.length !== unique.length)
    throw new InvalidInputError(GROUP_NOT_FOUND_MESSAGE);
  return selectGroups(found, unique);
}

/** Поля группы для записи: `undefined` — группы не трогаем (PATCH без поля),
 * иначе проверенные id в порядке создания групп и подпись. Одно место для
 * занятия и канала (ADR-0196): у обоих группы выбираются одинаково. */
export async function groupSelectionFields(
  model: Model<GroupRecord>,
  ids: readonly string[] | undefined,
): Promise<Partial<GroupSelection>> {
  if (ids === undefined) return {};
  return resolveGroupSelection(model, ids);
}
