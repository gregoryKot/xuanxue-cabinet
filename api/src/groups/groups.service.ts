// Список групп школы (ADR-0193): создание, переименование, удаление и счёт
// занятий. Подпись `groupLabel` у занятий — производная от названий групп;
// переименование пересобирает её у всех занятий группы, чтобы посты, бот и
// экраны учеников (их десятки мест) продолжали читать одно поле.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GROUP_NOT_FOUND_MESSAGE,
  groupNameKey,
  LIST_LIMIT_MAX,
  type GroupDto,
  type GroupInput,
} from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { ConflictError, NotFoundError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { assertObjectId } from '../common/object-id';
import { toGroupDto, type LeanGroup } from './group.mapper';
import { selectGroups } from './group-selection';
import { GroupRecord } from './group.schema';

function inUseMessage(count: number): string {
  return `Группа отмечена у занятий: ${count}. Сначала уберите её на странице каждого занятия, потом удалите.`;
}

function duplicateMessage(existingName: string): string {
  return `Группа «${existingName}» уже есть. Отметьте её в списке.`;
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(GroupRecord.name) private readonly model: Model<GroupRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async list(): Promise<GroupDto[]> {
    const [docs, counts] = await Promise.all([
      this.model.find().sort({ _id: 1 }).limit(LIST_LIMIT_MAX).lean<LeanGroup[]>(),
      this.classCounts(),
    ]);
    return docs.map((doc) => toGroupDto(doc, counts.get(doc._id.toString()) ?? 0));
  }

  async create(input: GroupInput): Promise<GroupDto> {
    const name = input.name.trim();
    try {
      const created = await this.model.create({ name, nameKey: groupNameKey(name) });
      const doc = await this.model.findById(created._id).lean<LeanGroup>();
      if (!doc) throw new NotFoundError(GROUP_NOT_FOUND_MESSAGE);
      return toGroupDto(doc, 0);
    } catch (error) {
      throw await this.duplicateOrRethrow(error, name);
    }
  }

  /** Группа по названию: есть — она, нет — заводится. Для импорта занятий из
   * файла сида (SeedService), где группа названа текстом. */
  async ensureByName(name: string): Promise<string> {
    const trimmed = name.trim();
    const existing = await this.model
      .findOne({ nameKey: groupNameKey(trimmed) })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (existing) return existing._id.toString();
    return (await this.create({ name: trimmed })).id;
  }

  async rename(id: string, input: GroupInput): Promise<GroupDto> {
    assertObjectId(id, GROUP_NOT_FOUND_MESSAGE);
    const name = input.name.trim();
    let doc: LeanGroup | null;
    try {
      doc = await this.model
        .findOneAndUpdate(
          { _id: id },
          { $set: { name, nameKey: groupNameKey(name) } },
          { returnDocument: 'after' },
        )
        .lean<LeanGroup>();
    } catch (error) {
      throw await this.duplicateOrRethrow(error, name);
    }
    if (!doc) throw new NotFoundError(GROUP_NOT_FOUND_MESSAGE);
    await this.rewriteClassLabels(doc._id);
    return toGroupDto(doc, (await this.classCounts()).get(id) ?? 0);
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, GROUP_NOT_FOUND_MESSAGE);
    const inUse = await this.classModel.countDocuments({ groupIds: id });
    if (inUse > 0) throw new ConflictError(inUseMessage(inUse));
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(GROUP_NOT_FOUND_MESSAGE);
  }

  /** Сколько занятий несёт каждая группа — одна агрегация на весь список. */
  private async classCounts(): Promise<Map<string, number>> {
    const rows = await this.classModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $unwind: '$groupIds' },
      { $group: { _id: '$groupIds', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }

  // Подпись занятия — склейка названий всех его групп, а не одного названия:
  // у занятия двух групп переименование одной меняет подпись целиком.
  private async rewriteClassLabels(groupId: Types.ObjectId): Promise<void> {
    const affected = await this.classModel
      .find({ groupIds: groupId })
      .select('groupIds')
      .lean<{ _id: Types.ObjectId; groupIds: Types.ObjectId[] }[]>();
    if (affected.length === 0) return;
    const all = await this.model.find().select('name').lean<LeanGroup[]>();
    await this.classModel.bulkWrite(
      affected.map((cls) => ({
        updateOne: {
          filter: { _id: cls._id },
          update: { $set: { groupLabel: selectGroups(all, cls.groupIds).groupLabel } },
        },
      })),
    );
  }

  private async duplicateOrRethrow(error: unknown, name: string): Promise<unknown> {
    if (!isDuplicateKeyError(error)) return error;
    const existing = await this.model
      .findOne({ nameKey: groupNameKey(name) })
      .select('name')
      .lean<{ name: string }>();
    return new ConflictError(duplicateMessage(existing?.name ?? name));
  }
}
